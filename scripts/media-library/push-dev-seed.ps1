param(
  [Parameter(Mandatory = $true)]
  [string]$RootPathOrUri,

  [Parameter(Mandatory = $true)]
  [string]$Username,

  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$ConnectionId = 'conn_webdav_dev',
  [string]$DisplayName = 'Dev WebDAV',
  [string]$CredentialRef = 'credential__conn_webdav_dev'
)

$targetDir = '/sdcard/Android/media/cn.toside.music.mobile'
$targetFile = "$targetDir/media-library-dev-seed.json"
$tempFile = Join-Path $env:TEMP 'media-library-dev-seed.json'

$payload = @{
  connections = @(
    @{
      connection = @{
        connectionId = $ConnectionId
        providerType = 'webdav'
        displayName = $DisplayName
        rootPathOrUri = $RootPathOrUri
        credentialRef = $CredentialRef
        lastScanStatus = 'idle'
      }
      credential = @{
        username = $Username
        password = $Password
      }
    }
  )
}

$json = $payload | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($tempFile, $json, [System.Text.UTF8Encoding]::new($false))

adb shell "mkdir -p $targetDir" | Out-Null
adb push $tempFile $targetFile | Out-Null

Write-Output "Seed file pushed to $targetFile"
