param([Parameter(Mandatory=$true)][string]$Scratch)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$exhibit = (Resolve-Path (Join-Path $PSScriptRoot '../../site/works/forbidden-broadcast/exhibit')).Path
$null = New-Item -ItemType Directory -Force -Path $Scratch
$scratchPath = (Resolve-Path $Scratch).Path
$news = Get-Content -Raw -Encoding utf8 (Join-Path $exhibit 'program.json') | ConvertFrom-Json
$voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $korean = $voice.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1
    if (!$korean) { throw 'A Korean Windows System.Speech voice is required to rebuild the narration.' }
    $voice.SelectVoice($korean.VoiceInfo.Name)
    $voice.Rate = -1
    $voice.Volume = 100
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
        22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    for ($index = 0; $index -lt $news.Count; $index++) {
        $path = Join-Path $scratchPath ('news-' + $index + '.wav')
        $voice.SetOutputToWaveFile($path, $format)
        $voice.Speak($news[$index].text)
        $voice.SetOutputToNull()
    }
    Write-Output ('Narration: ' + $korean.VoiceInfo.Name)
} finally { $voice.Dispose() }
node (Join-Path $PSScriptRoot 'mix-news.mjs') $exhibit $scratchPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
