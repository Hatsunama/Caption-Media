param(
  [ValidateSet('start', 'android', 'dev-client', 'build-android', 'doctor', 'help')]
  [string]$Mode = 'start'
)

$ErrorActionPreference = 'Stop'
$env:GRADLE_OPTS = '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

switch ($Mode) {
  'start' { & npx expo start; exit $LASTEXITCODE }
  'android' { & npx expo start --android; exit $LASTEXITCODE }
  'dev-client' { & npx expo start --dev-client; exit $LASTEXITCODE }
  'build-android' { & npx expo run:android; exit $LASTEXITCODE }
  'doctor' { & npx expo-doctor; exit $LASTEXITCODE }
  'help' {
    Write-Output 'Modes: start, android, dev-client, build-android, doctor, help'
  }
}
