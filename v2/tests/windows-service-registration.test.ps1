# Runs in Windows PowerShell 5.1 or PowerShell 7 on any OS. No COM/OS tasks are created.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot '../platform/windows/ServiceRegistration.ps1')

class FakeCollection {
    [object] $Value
    [int] $Kind = -1
    [object] Create([int] $kind) {
        $this.Kind = $kind
        return $this.Value
    }
    [object] Item([int] $index) {
        if ($index -ne 1) { throw 'Unexpected action index' }
        return $this.Value
    }
}
class FakeTask {
    [object] $Definition
    [bool] $Enabled = $true
    [int] $State = 3
    [int] $Runs = 0
    [int] $Stops = 0
    [int] $PendingStops = 0
    [bool] $FailStop = $false
    [bool] $FailRun = $false
    [bool] $AlreadyStopped = $false
    [object] Run([object] $unused) {
        if ($this.FailRun) { throw 'Cannot start task' }
        $this.Runs++
        $this.State = 4
        return $null
    }
    [void] Stop([int] $flags) {
        if ($this.Enabled) { throw 'Task must be disabled before stopping' }
        if ($flags -ne 0) { throw 'Unexpected stop flags' }
        if ($this.FailStop) { throw 'Cannot stop task' }
        $this.Stops++
        if ($this.AlreadyStopped) { throw [System.Runtime.InteropServices.COMException]::new('Not running', -2147216629) }
        $this.State = 1
    }
    [object] GetInstances([int] $flags) {
        if ($this.PendingStops -gt 0) {
            $this.PendingStops--
            return @{ Count = 1 }
        }
        return @{ Count = 0 }
    }
}
class FakeFolder {
    [FakeTask] $Task
    [int] $Creates = 0
    [int] $Deletes = 0
    [string] $Name
    [string] $Sid
    [bool] $Deny = $false
    [bool] $FailCreate = $false
    [bool] $FailDelete = $false
    [object] GetTask([string] $name) {
        if ($this.Deny) { throw [UnauthorizedAccessException]::new('Access denied') }
        if ($null -eq $this.Task) { throw [System.IO.FileNotFoundException]::new('Task missing') }
        if ($name -ne $this.Name) { throw 'Wrong user task requested' }
        return $this.Task
    }
    [object] RegisterTaskDefinition([string] $name, [object] $definition, [int] $flags, [string] $sid, [object] $password, [int] $logonType, [object] $sddl) {
        if ($this.FailCreate) { throw 'Cannot create task' }
        if ($flags -ne 2 -or $logonType -ne 3 -or $null -ne $password) { throw 'Unsafe registration flags' }
        $this.Creates++
        $this.Name = $name
        $this.Sid = $sid
        $this.Task = [FakeTask]::new()
        $this.Task.Definition = $definition
        return $this.Task
    }
    [void] DeleteTask([string] $name, [int] $flags) {
        if ($this.FailDelete) { throw 'Cannot delete task' }
        if ($name -ne $this.Name -or $flags -ne 0) { throw 'Unexpected delete' }
        if ($this.Task.Enabled -or $this.Task.Stops -eq 0 -or $this.Task.PendingStops -ne 0) { throw 'Deleted a live task' }
        $this.Deletes++
        $this.Task = $null
    }
}
class FakeScheduler {
    [FakeFolder] $Folder = [FakeFolder]::new()
    [object] GetFolder([string] $path) {
        if ($path -ne '\') { throw 'Unexpected task folder' }
        return $this.Folder
    }
    [object] NewTask([int] $flags) {
        $actions = [FakeCollection]::new()
        $actions.Value = @{ Path = ''; Arguments = ''; WorkingDirectory = '' }
        $triggers = [FakeCollection]::new()
        $triggers.Value = @{ UserId = ''; Enabled = $false }
        return @{
            RegistrationInfo = @{}
            Principal = @{}
            Settings = @{}
            Actions = $actions
            Triggers = $triggers
        }
    }
}
function Assert-Equal($Actual, $Expected, [string] $Message) {
    if ($Actual -cne $Expected) { throw "$Message (expected: $Expected, actual: $Actual)" }
}
function Assert-Fails([scriptblock] $Action, [string] $Message) {
    $failed = $false
    try { $null = & $Action } catch { $failed = $true }
    if (-not $failed) { throw $Message }
}
$script:passed = 0
function Test-Case([string] $Name, [scriptblock] $Body) {
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
}
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('knoter-registration-' + [guid]::NewGuid())
# Construct Unicode without relying on the Windows PowerShell 5.1 source-file encoding.
$resources = Join-Path $fixture (([char]0xD55C).ToString() + ' & $data; O''Brien App/resources')
$null = New-Item -ItemType Directory -Path (Join-Path $resources 'runtime') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $resources 'backend') -Force
$runtime = Join-Path $resources 'runtime/node.exe'
$entry = Join-Path $resources 'backend/service.mjs'
Set-Content -LiteralPath $runtime -Value 'mock runtime'
Set-Content -LiteralPath $entry -Value 'mock service'
$sid = 'S-1-5-21-100-200-300-1001'
function Invoke-TestAction($Scheduler, $Action) {
    Invoke-KnoterRegistration -Scheduler $Scheduler -UserSid $sid -ResourcesPath $resources -Action $Action
}
try {
    Test-Case 'missing status and unregister are idempotent' {
        $scheduler = [FakeScheduler]::new()
        Assert-Equal (Invoke-TestAction $scheduler 'status').status 'task_disabled' 'missing status'
        Assert-Equal (Invoke-TestAction $scheduler 'unregister').status 'task_disabled' 'missing unregister'
        Assert-Equal $scheduler.Folder.Deletes 0 'must not delete missing task'
        Assert-Equal $scheduler.Folder.Creates 0 'must not register on read'
    }
    Test-Case 'register creates a per-user, non-elevated logon task and starts bundled Node directly' {
        $scheduler = [FakeScheduler]::new()
        Assert-Equal (Invoke-TestAction $scheduler 'register').status 'task_running' 'initial start'
        $folder = $scheduler.Folder
        $definition = $folder.Task.Definition
        Assert-Equal $folder.Name "Knoter Wiki Demo Worker-$sid" 'user-specific name'
        Assert-Equal $folder.Sid $sid 'registration owner'
        Assert-Equal $definition.Principal.UserId $sid 'principal'
        Assert-Equal $definition.Principal.LogonType 3 'interactive token'
        Assert-Equal $definition.Principal.RunLevel 0 'limited privileges'
        Assert-Equal $definition.Triggers.Kind 9 'logon trigger'
        Assert-Equal $definition.Triggers.Value.UserId $sid 'only this user logon'
        Assert-Equal $definition.Triggers.Value.Enabled $true 'trigger enabled'
        Assert-Equal $definition.Actions.Kind 0 'exec action'
        Assert-Equal $definition.Actions.Value.Path $runtime 'literal executable path'
        Assert-Equal $definition.Actions.Value.Arguments ('"' + $entry + '"') 'quoted Unicode path'
        Assert-Equal $definition.Actions.Value.WorkingDirectory $resources 'working directory'
        foreach ($item in @{
            Enabled = $true; AllowDemandStart = $true; AllowHardTerminate = $true; MultipleInstances = 2;
            RestartInterval = 'PT1M'; RestartCount = 3; DisallowStartIfOnBatteries = $false;
            StopIfGoingOnBatteries = $false; ExecutionTimeLimit = 'PT0S';
            RunOnlyIfIdle = $false; RunOnlyIfNetworkAvailable = $false; WakeToRun = $false
        }.GetEnumerator()) {
            Assert-Equal $definition.Settings[$item.Key] $item.Value $item.Key
        }
        $null = Invoke-TestAction $scheduler 'register'
        Assert-Equal $folder.Creates 1 'repeated register does not overwrite'
        Assert-Equal $folder.Task.Runs 1 'repeated register does not duplicate running task'
        $folder.Task.State = 2
        $null = Invoke-TestAction $scheduler 'register'
        Assert-Equal $folder.Task.Runs 1 'queued task is not started twice'
        $folder.Task.Enabled = $false
        $folder.Task.State = 1
        $null = Invoke-TestAction $scheduler 'register'
        Assert-Equal $folder.Task.Runs 2 're-enables and starts a disabled task'
    }
    Test-Case 'status reports scheduler state without mutating a task' {
        $scheduler = [FakeScheduler]::new()
        $null = Invoke-TestAction $scheduler 'register'
        foreach ($item in @{ 4 = 'task_running'; 2 = 'task_queued'; 3 = 'task_registered'; 0 = 'task_unknown' }.GetEnumerator()) {
            $scheduler.Folder.Task.State = $item.Key
            Assert-Equal (Invoke-TestAction $scheduler 'status').status $item.Value 'scheduler state'
        }
        $scheduler.Folder.Task.Enabled = $false
        Assert-Equal (Invoke-TestAction $scheduler 'approvalSettings').status 'task_disabled' 'disabled status'
        Assert-Equal $scheduler.Folder.Creates 1 'read does not create'
        Assert-Equal $scheduler.Folder.Task.Runs 1 'read does not start'
    }
    Test-Case 'unregister disables, stops and waits before deleting, leaving application files intact' {
        $scheduler = [FakeScheduler]::new()
        $null = Invoke-TestAction $scheduler 'register'
        $task = $scheduler.Folder.Task
        $task.PendingStops = 2
        Assert-Equal (Invoke-TestAction $scheduler 'unregister').status 'task_disabled' 'removed status'
        Assert-Equal $task.Stops 1 'stop once'
        Assert-Equal $scheduler.Folder.Deletes 1 'delete once'
        $null = Invoke-TestAction $scheduler 'unregister'
        Assert-Equal $scheduler.Folder.Deletes 1 'repeat unregister'
        Assert-Equal (Test-Path -LiteralPath $entry) $true 'service files preserved'
    }
    Test-Case 'access denied does not masquerade as unregistered or overwrite a task' {
        $scheduler = [FakeScheduler]::new()
        $scheduler.Folder.Deny = $true
        foreach ($action in @('status', 'register', 'unregister')) {
            Assert-Fails { Invoke-TestAction $scheduler $action } 'must propagate access denied'
        }
        Assert-Equal $scheduler.Folder.Creates 0 'no create on denied query'
    }
    Test-Case 'missing runtime prevents registration' {
        $scheduler = [FakeScheduler]::new()
        Assert-Fails { Invoke-KnoterRegistration $scheduler $sid (Join-Path $fixture 'absent') 'register' } 'missing bundle must fail'
        Assert-Equal $scheduler.Folder.Creates 0 'no create without runtime'
    }
    Test-Case 'moved installation is not silently overwritten or started' {
        $scheduler = [FakeScheduler]::new()
        $null = Invoke-TestAction $scheduler 'register'
        $scheduler.Folder.Task.Definition.Actions.Value.Path = 'another-installation.exe'
        Assert-Fails { Invoke-TestAction $scheduler 'register' } 'different installation must fail'
        Assert-Equal $scheduler.Folder.Creates 1 'must not overwrite'
        Assert-Equal $scheduler.Folder.Task.Runs 1 'must not start stale installation'
    }
    Test-Case 'create, start, stop and delete failures propagate' {
        $scheduler = [FakeScheduler]::new()
        $scheduler.Folder.FailCreate = $true
        Assert-Fails { Invoke-TestAction $scheduler 'register' } 'create failure'
        $scheduler.Folder.FailCreate = $false
        $null = Invoke-TestAction $scheduler 'register'
        $task = $scheduler.Folder.Task
        $task.State = 3
        $task.FailRun = $true
        Assert-Fails { Invoke-TestAction $scheduler 'register' } 'start failure'
        $task.FailStop = $true
        Assert-Fails { Invoke-TestAction $scheduler 'unregister' } 'stop failure'
        Assert-Equal $scheduler.Folder.Deletes 0 'must not delete after failed stop'
        $task.FailStop = $false
        $scheduler.Folder.FailDelete = $true
        Assert-Fails { Invoke-TestAction $scheduler 'unregister' } 'delete failure'
    }
    Test-Case 'a task that exited before Stop can still be unregistered' {
        $scheduler = [FakeScheduler]::new()
        $null = Invoke-TestAction $scheduler 'register'
        $scheduler.Folder.Task.AlreadyStopped = $true
        Assert-Equal (Invoke-TestAction $scheduler 'unregister').status 'task_disabled' 'already stopped'
        Assert-Equal $scheduler.Folder.Deletes 1 'removes stopped task'
    }
    Test-Case 'stop timeout leaves the registration disabled and does not delete or restart it' {
        $scheduler = [FakeScheduler]::new()
        $null = Invoke-TestAction $scheduler 'register'
        $scheduler.Folder.Task.PendingStops = 1000
        Assert-Fails { Invoke-TestAction $scheduler 'unregister' } 'stop timeout'
        Assert-Equal $scheduler.Folder.Deletes 0 'must not delete a running task'
        Assert-Equal $scheduler.Folder.Task.Enabled $false 'must not restart'
        Assert-Equal $scheduler.Folder.Task.Runs 1 'does not start a replacement'
    }
    Test-Case 'unknown actions fail without changing registration' {
        $scheduler = [FakeScheduler]::new()
        Assert-Fails { Invoke-TestAction $scheduler 'invalid' } 'invalid action'
        Assert-Equal $scheduler.Folder.Creates 0 'no mutation'
    }
    Write-Output "$script:passed mocked Task Scheduler tests passed. Native Windows integration was not exercised."
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
