# Task Scheduler COM is used instead of parsing localized schtasks output.
# This file only defines functions, allowing lifecycle tests with a fake scheduler.
function Test-KnoterHResult($Exception, [int] $Code) {
    while ($null -ne $Exception) {
        if ($Exception.HResult -eq $Code) { return $true }
        $Exception = $Exception.InnerException
    }
    return $false
}

function Get-KnoterTask($Folder, [string] $Name) {
    try { return $Folder.GetTask($Name) }
    catch {
        # HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND), not access denied/service down.
        if (Test-KnoterHResult $_.Exception -2147024894) { return $null }
        throw
    }
}

function Stop-KnoterTask($Task) {
    # Prevent logon/restart triggers from racing with removal or re-registration.
    $Task.Enabled = $false
    try { $Task.Stop(0) }
    catch {
        # SCHED_E_TASK_NOT_RUNNING: it may have exited between status and Stop.
        if (-not (Test-KnoterHResult $_.Exception -2147216629)) { throw }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    while ($Task.GetInstances(0).Count -gt 0) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Timed out stopping the background task.' }
        Start-Sleep -Milliseconds 100
    }
}

function Invoke-KnoterRegistration($Scheduler, [string] $UserSid, [string] $ResourcesPath, [string] $Action) {
    $name = "Knoter Wiki Demo Worker-$UserSid"
    $folder = $Scheduler.GetFolder('\')
    $task = Get-KnoterTask $folder $name
    switch ($Action) {
        'register' {
            $runtime = Join-Path $ResourcesPath 'runtime/node.exe'
            $entry = Join-Path $ResourcesPath 'backend/service.mjs'
            foreach ($path in @($runtime, $entry)) {
                if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                    throw "Packaged Windows service file is missing: $path"
                }
            }
            # ExecAction accepts an executable and Windows command-line arguments,
            # not a shell. Windows filenames cannot contain a double quote.
            $arguments = '"' + $entry + '"'
            if ($null -ne $task) {
                $existing = $task.Definition.Actions.Item(1)
                if ($existing.Path -ne $runtime -or $existing.Arguments -ne $arguments) {
                    throw 'The service points to another installation. Disable it before moving or replacing the app.'
                }
            } else {
                $definition = $Scheduler.NewTask(0)
                $definition.RegistrationInfo.Description = 'Knoter wiki worker for the signed-in user.'
                $definition.Principal.UserId = $UserSid
                $definition.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN: no stored password
                $definition.Principal.RunLevel = 0 # TASK_RUNLEVEL_LUA: never elevate
                $trigger = $definition.Triggers.Create(9) # TASK_TRIGGER_LOGON
                $trigger.UserId = $UserSid
                $trigger.Enabled = $true
                $settings = $definition.Settings
                $settings.Enabled = $true
                $settings.AllowDemandStart = $true
                $settings.AllowHardTerminate = $true
                $settings.MultipleInstances = 2 # TASK_INSTANCES_IGNORE_NEW
                $settings.RestartInterval = 'PT1M'
                $settings.RestartCount = 3
                $settings.DisallowStartIfOnBatteries = $false
                $settings.StopIfGoingOnBatteries = $false
                $settings.RunOnlyIfIdle = $false
                $settings.RunOnlyIfNetworkAvailable = $false
                $settings.ExecutionTimeLimit = 'PT0S'
                $settings.WakeToRun = $false
                $exec = $definition.Actions.Create(0) # TASK_ACTION_EXEC
                # Node is the tracked task process; no detached launcher/child.
                $exec.Path = $runtime
                $exec.Arguments = $arguments
                $exec.WorkingDirectory = $ResourcesPath
                # TASK_CREATE, scoped to this user; no overwrite of an existing task.
                $task = $folder.RegisterTaskDefinition($name, $definition, 2, $UserSid, $null, 3, $null)
            }
            $task.Enabled = $true
            if ($task.State -ne 4 -and $task.State -ne 2) { $null = $task.Run($null) }
        }
        'unregister' {
            if ($null -ne $task) {
                Stop-KnoterTask $task
                $folder.DeleteTask($name, 0)
            }
        }
        'status' {}
        'approvalSettings' {}
        default { throw 'Unknown service action.' }
    }
    $task = Get-KnoterTask $folder $name
    $status = 'task_disabled'
    if ($null -ne $task -and $task.Enabled) {
        $status = switch ($task.State) {
            4 { 'task_running' }
            2 { 'task_queued' }
            3 { 'task_registered' }
            default { 'task_unknown' }
        }
    }
    return @{ status = $status; registration = 'per-user Task Scheduler' }
}
