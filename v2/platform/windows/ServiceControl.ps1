param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('register', 'unregister', 'status', 'approvalSettings')]
    [string] $Action,
    [Parameter(Mandatory = $true)]
    [string] $ResourcesPath
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    . (Join-Path $PSScriptRoot 'ServiceRegistration.ps1')
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    if ($Action -eq 'approvalSettings') {
        Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\mmc.exe') -ArgumentList 'taskschd.msc'
    }
    Invoke-KnoterRegistration -Scheduler $scheduler -UserSid $sid -ResourcesPath $ResourcesPath -Action $Action |
        ConvertTo-Json -Compress
} catch {
    @{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
