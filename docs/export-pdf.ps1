param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$Pdf,
  [Parameter(Mandatory = $true)][string]$ImageDir
)
# Uses the installed Microsoft PowerPoint to save a PDF and export slide images.
$ErrorActionPreference = "Stop"
$app = New-Object -ComObject PowerPoint.Application
try {
  # Open read-only, untitled, without a window.
  $pres = $app.Presentations.Open($Pptx, $true, $false, $false)
  try {
    $pres.SaveAs($Pdf, 32)  # 32 = ppSaveAsPDF
    if (-not (Test-Path $ImageDir)) { New-Item -ItemType Directory -Path $ImageDir | Out-Null }
    Get-ChildItem $ImageDir -Filter "slide-*.png" | Remove-Item -Force
    foreach ($slide in $pres.Slides) {
      $file = Join-Path $ImageDir ("slide-{0}.png" -f $slide.SlideIndex)
      $slide.Export($file, "PNG", 1600, 900)
    }
    "Slides: $($pres.Slides.Count)"
  } finally {
    $pres.Close()
  }
} finally {
  $app.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
