param(
  [Parameter(Mandatory = $true)][string]$TravelXlsx,
  [Parameter(Mandatory = $true)][string]$GeneralXlsx,
  [Parameter(Mandatory = $true)][string]$SummaryXlsx,
  [Parameter(Mandatory = $true)][string]$PrivateCarXlsx,
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\src\tools\reimbursement\assets\templates")
)

$ErrorActionPreference = "Stop"

$PageWidth = 595.28
$PageHeight = 841.89
$LeftMargin = 50.4
$TopMargin = 54.0

function Get-HAlign([int]$Value) {
  switch ($Value) {
    -4131 { return "left" }
    -4130 { return "left" }
    -4108 { return "center" }
    7 { return "center" }
    -4152 { return "right" }
    default { return "left" }
  }
}

function New-Field($Worksheet, [string]$Address, [double]$PrintLeft, [double]$PrintTop, [double]$Scale) {
  $range = $Worksheet.Range($Address)

  $x = $LeftMargin + (($range.Left - $PrintLeft) * $Scale)
  $top = ($range.Top - $PrintTop) * $Scale
  $y = $PageHeight - $TopMargin - $top - ($range.Height * $Scale)

  $fontName = "Calibri"
  $fontSize = 9.0
  $hAlign = -4131
  $wrap = $false
  try { if ($range.Font.Name) { $fontName = [string]$range.Font.Name } } catch { }
  try { if ($range.Font.Size -gt 0) { $fontSize = [double]$range.Font.Size } } catch { }
  try { $hAlign = [int]$range.HorizontalAlignment } catch { }
  try { $wrap = [bool]$range.WrapText } catch { }

  return [pscustomobject][ordered]@{
    address = $Address
    x = [math]::Round($x, 2)
    y = [math]::Round($y, 2)
    width = [math]::Round($range.Width * $Scale, 2)
    height = [math]::Round($range.Height * $Scale, 2)
    font = $fontName
    fontSize = [math]::Round($fontSize * $Scale, 2)
    align = (Get-HAlign $hAlign)
    wrap = $wrap
  }
}

function New-ImageField($Worksheet, [string]$Address, [double]$PrintLeft, [double]$PrintTop, [double]$Scale, [double]$Padding = 2, [double]$GrowDown = 0) {
  $field = New-Field $Worksheet $Address $PrintLeft $PrintTop $Scale
  $field | Add-Member -NotePropertyName image -NotePropertyValue $true
  $field | Add-Member -NotePropertyName padding -NotePropertyValue $Padding
  if ($GrowDown -ne 0) {
    $field.y = [math]::Round($field.y - $GrowDown, 2)
    $field.height = [math]::Round($field.height + $GrowDown, 2)
  }
  return $field
}

function Build-TravelFields($Worksheet, [double]$PrintLeft, [double]$PrintTop, [double]$Scale) {
  $fields = [ordered]@{}
  $fields.number = New-Field $Worksheet "C2:D2" $PrintLeft $PrintTop $Scale
  $fields.dateYear = New-Field $Worksheet "K2" $PrintLeft $PrintTop $Scale
  $fields.dateMonth = New-Field $Worksheet "M2" $PrintLeft $PrintTop $Scale
  $fields.dateDay = New-Field $Worksheet "O2" $PrintLeft $PrintTop $Scale
  $fields.name = New-Field $Worksheet "C3:D3" $PrintLeft $PrintTop $Scale
  $fields.companions = New-Field $Worksheet "G3:H3" $PrintLeft $PrintTop $Scale
  $fields.project = New-Field $Worksheet "J3:N3" $PrintLeft $PrintTop $Scale
  $fields.totalDays = New-Field $Worksheet "Q3" $PrintLeft $PrintTop $Scale

  $columnMap = [ordered]@{
    A = "departMonth"; B = "departDay"; C = "departHour"; D = "departPlace"
    E = "arriveMonth"; F = "arriveDay"; G = "arriveHour"; H = "arrivePlace"
    I = "trainNo"; J = "headcount"; K = "vehicleAmount"
    L = "travelDays"; M = "travelAmount"; N = "personDays"; O = "mealAmount"
    P = "roomNights"; Q = "lodgingAmount"
  }

  $rows = @()
  for ($rowIndex = 6; $rowIndex -le 32; $rowIndex++) {
    $row = [ordered]@{}
    foreach ($column in $columnMap.Keys) {
      $row[$columnMap[$column]] = New-Field $Worksheet "$column$rowIndex" $PrintLeft $PrintTop $Scale
    }
    $rows += [pscustomobject]$row
  }
  $fields.rows = $rows

  $fields.vehicleSubtotal = New-Field $Worksheet "J33:K33" $PrintLeft $PrintTop $Scale
  $fields.travelSubtotal = New-Field $Worksheet "L33:M33" $PrintLeft $PrintTop $Scale
  $fields.mealSubtotal = New-Field $Worksheet "N33:O33" $PrintLeft $PrintTop $Scale
  $fields.lodgingSubtotal = New-Field $Worksheet "P33:Q33" $PrintLeft $PrintTop $Scale

  $fields.extraPublicTransport = New-Field $Worksheet "D34" $PrintLeft $PrintTop $Scale
  $fields.extraTaxi = New-Field $Worksheet "I34" $PrintLeft $PrintTop $Scale
  $fields.extraPostage = New-Field $Worksheet "M34" $PrintLeft $PrintTop $Scale
  $fields.extraStorage = New-Field $Worksheet "Q34" $PrintLeft $PrintTop $Scale
  $fields.extraRefundFee = New-Field $Worksheet "D35" $PrintLeft $PrintTop $Scale
  $fields.extraParking = New-Field $Worksheet "I35" $PrintLeft $PrintTop $Scale
  $fields.extraFuel = New-Field $Worksheet "M35" $PrintLeft $PrintTop $Scale
  $fields.extraOther = New-Field $Worksheet "Q35" $PrintLeft $PrintTop $Scale

  $fields.extraTotal = New-Field $Worksheet "J36:Q36" $PrintLeft $PrintTop $Scale
  $fields.grandTotal = New-Field $Worksheet "J37:Q37" $PrintLeft $PrintTop $Scale
  $fields.uppercase = New-Field $Worksheet "E38:I38" $PrintLeft $PrintTop $Scale
  $fields.prepayment = New-Field $Worksheet "L38:M38" $PrintLeft $PrintTop $Scale
  $fields.payable = New-Field $Worksheet "P38:Q38" $PrintLeft $PrintTop $Scale
  $fields.attachmentCount = New-Field $Worksheet "R8:R10" $PrintLeft $PrintTop $Scale

  $fields.approvals = [ordered]@{
    reviewer = New-Field $Worksheet "C39:D39" $PrintLeft $PrintTop $Scale
    cashier = New-Field $Worksheet "G39:I39" $PrintLeft $PrintTop $Scale
    supervisor = New-Field $Worksheet "K39:M39" $PrintLeft $PrintTop $Scale
  }
  $fields.signature = New-ImageField $Worksheet "P39:R39" $PrintLeft $PrintTop $Scale 2 9.75

  return [pscustomobject]$fields
}

function Build-GeneralFields($Worksheet, [double]$PrintLeft, [double]$PrintTop, [double]$Scale) {
  $fields = [ordered]@{}
  $fields.dateYear = New-Field $Worksheet "E3" $PrintLeft $PrintTop $Scale
  $fields.dateMonth = New-Field $Worksheet "G3" $PrintLeft $PrintTop $Scale
  $fields.dateDay = New-Field $Worksheet "I3" $PrintLeft $PrintTop $Scale

  $rows = @()
  for ($rowIndex = 6; $rowIndex -le 24; $rowIndex++) {
    $amountCells = @()
    foreach ($column in @("J", "K", "L", "M", "N", "O", "P", "Q", "R")) {
      $amountCells += New-Field $Worksheet "$column$rowIndex" $PrintLeft $PrintTop $Scale
    }
    $row = [ordered]@{
      month = New-Field $Worksheet "A$rowIndex" $PrintLeft $PrintTop $Scale
      day = New-Field $Worksheet "B$rowIndex" $PrintLeft $PrintTop $Scale
      description = New-Field $Worksheet "C$($rowIndex):H$rowIndex" $PrintLeft $PrintTop $Scale
      receiptCount = New-Field $Worksheet "I$rowIndex" $PrintLeft $PrintTop $Scale
      amountDigits = $amountCells
      note = New-Field $Worksheet "S$rowIndex" $PrintLeft $PrintTop $Scale
    }
    $rows += [pscustomobject]$row
  }
  $fields.rows = $rows

  $totalDigits = @()
  foreach ($column in @("J", "K", "L", "M", "N", "O", "P", "Q", "R")) {
    $totalDigits += New-Field $Worksheet "${column}25" $PrintLeft $PrintTop $Scale
  }
  $fields.uppercase = New-Field $Worksheet "E25:I25" $PrintLeft $PrintTop $Scale
  $fields.totalDigits = $totalDigits
  $fields.attachmentCount = New-Field $Worksheet "T7:T8" $PrintLeft $PrintTop $Scale

  $fields.approvals = [ordered]@{
    supervisor = New-Field $Worksheet "E26:I26" $PrintLeft $PrintTop $Scale
    reviewer = New-Field $Worksheet "C27:F27" $PrintLeft $PrintTop $Scale
    cashier = New-Field $Worksheet "H27:M27" $PrintLeft $PrintTop $Scale
    reimburser = New-Field $Worksheet "R27:S27" $PrintLeft $PrintTop $Scale
  }
  $fields.signature = New-ImageField $Worksheet "S26" $PrintLeft $PrintTop $Scale 3

  return [pscustomobject]$fields
}

function Build-SummaryFields($Worksheet, [double]$PrintLeft, [double]$PrintTop, [double]$Scale) {
  $fields = [ordered]@{}
  $fields.dateYear = New-Field $Worksheet "J2:L2" $PrintLeft $PrintTop $Scale
  $fields.dateMonth = New-Field $Worksheet "N2:O2" $PrintLeft $PrintTop $Scale
  $fields.dateDay = New-Field $Worksheet "Q2:R2" $PrintLeft $PrintTop $Scale

  $rows = @()
  for ($rowIndex = 5; $rowIndex -le 23; $rowIndex++) {
    $amountCells = @()
    foreach ($column in @("J", "K", "L", "M", "N", "O", "P", "Q", "R")) {
      $amountCells += New-Field $Worksheet "$column$rowIndex" $PrintLeft $PrintTop $Scale
    }
    $row = [ordered]@{
      month = New-Field $Worksheet "A$rowIndex" $PrintLeft $PrintTop $Scale
      day = New-Field $Worksheet "B$rowIndex" $PrintLeft $PrintTop $Scale
      project = New-Field $Worksheet "C$($rowIndex):I$rowIndex" $PrintLeft $PrintTop $Scale
      amountDigits = $amountCells
      note = New-Field $Worksheet "S$rowIndex" $PrintLeft $PrintTop $Scale
    }
    $rows += [pscustomobject]$row
  }
  $fields.rows = $rows

  $fields.uppercase = New-Field $Worksheet "G24:S24" $PrintLeft $PrintTop $Scale
  $fields.total = New-Field $Worksheet "H25:R25" $PrintLeft $PrintTop $Scale

  $fields.approvals = [ordered]@{
    reviewer = New-Field $Worksheet "C26:D26" $PrintLeft $PrintTop $Scale
    finance = New-Field $Worksheet "F26:G26" $PrintLeft $PrintTop $Scale
    cashier = New-Field $Worksheet "I26:J26" $PrintLeft $PrintTop $Scale
    supervisor = New-Field $Worksheet "N26:P26" $PrintLeft $PrintTop $Scale
  }
  $fields.signature = New-ImageField $Worksheet "S26" $PrintLeft $PrintTop $Scale 2

  return [pscustomobject]$fields
}

function Build-PrivateCarFields($Worksheet, [double]$PrintLeft, [double]$PrintTop, [double]$Scale) {
  $fields = [ordered]@{}
  $fields.dateText = New-Field $Worksheet "G3:I3" $PrintLeft $PrintTop $Scale
  $fields.user = New-Field $Worksheet "B4:C4" $PrintLeft $PrintTop $Scale
  $fields.plate = New-Field $Worksheet "E4:G4" $PrintLeft $PrintTop $Scale
  $fields.companions = New-Field $Worksheet "I4" $PrintLeft $PrintTop $Scale
  $fields.purpose = New-Field $Worksheet "C5:I5" $PrintLeft $PrintTop $Scale

  $trips = @()
  foreach ($blockStart in @(6, 10, 14, 18, 22, 26, 30, 34, 38, 42)) {
    $inputRow = $blockStart + 2
    $odometerRow = $blockStart + 3
    $trip = [ordered]@{
      departYear = New-Field $Worksheet "A$inputRow" $PrintLeft $PrintTop $Scale
      departMonth = New-Field $Worksheet "B$inputRow" $PrintLeft $PrintTop $Scale
      departDay = New-Field $Worksheet "C$inputRow" $PrintLeft $PrintTop $Scale
      departPlace = New-Field $Worksheet "D$inputRow" $PrintLeft $PrintTop $Scale
      arriveYear = New-Field $Worksheet "E$inputRow" $PrintLeft $PrintTop $Scale
      arriveMonth = New-Field $Worksheet "F$inputRow" $PrintLeft $PrintTop $Scale
      arriveDay = New-Field $Worksheet "G$inputRow" $PrintLeft $PrintTop $Scale
      arrivePlace = New-Field $Worksheet "H$inputRow" $PrintLeft $PrintTop $Scale
      startOdometer = New-Field $Worksheet "D$odometerRow" $PrintLeft $PrintTop $Scale
      endOdometer = New-Field $Worksheet "H$odometerRow" $PrintLeft $PrintTop $Scale
      distance = New-Field $Worksheet "I$odometerRow" $PrintLeft $PrintTop $Scale
    }
    $trips += [pscustomobject]$trip
  }
  $fields.trips = $trips

  $fields.totalDistance = New-Field $Worksheet "D46" $PrintLeft $PrintTop $Scale
  $fields.fee = New-Field $Worksheet "H46" $PrintLeft $PrintTop $Scale

  $fields.approvals = [ordered]@{
    reviewer = New-Field $Worksheet "C47:D47" $PrintLeft $PrintTop $Scale
    cashier = New-Field $Worksheet "F47:G47" $PrintLeft $PrintTop $Scale
  }
  $fields.signature = New-ImageField $Worksheet "I47" $PrintLeft $PrintTop $Scale 2 10.5

  return [pscustomobject]$fields
}

$travelClear = @(
  "C2:D2", "K2", "M2", "O2",
  "C3:D3", "G3:H3", "J3:N3", "Q3",
  "A6:Q32", "J33:Q33",
  "D34", "I34", "M34", "Q34",
  "D35", "I35", "M35", "Q35",
  "J36:Q37", "E38:I38", "L38:M38", "P38:Q38",
  "R8:R10"
)

$generalClear = @(
  "E3", "G3", "I3",
  "A6:S24", "E25:I25", "J25:R25", "T7:T8"
)

$summaryClear = @(
  "J2:L2", "N2:O2", "Q2:R2",
  "A5:S23", "G24:S24", "H25:R25"
)

$privateClear = @("G3:I3", "B4:C4", "E4:G4", "I4", "C5:I5", "D46", "H46")
foreach ($blockStart in @(6, 10, 14, 18, 22, 26, 30, 34, 38, 42)) {
  $privateClear += "A$($blockStart + 2):H$($blockStart + 2)"
  $privateClear += "D$($blockStart + 3)"
  $privateClear += "H$($blockStart + 3)"
  $privateClear += "I$($blockStart + 3)"
}

$specs = @(
  [pscustomobject]@{
    Key = "travel"; Source = $TravelXlsx; PrintArea = '$A$1:$R$39'; Zoom = 97;
    Clear = $travelClear; Build = "Build-TravelFields"
  },
  [pscustomobject]@{
    Key = "general"; Source = $GeneralXlsx; PrintArea = '$A$1:$T$27'; Zoom = 95;
    Clear = $generalClear; Build = "Build-GeneralFields"
  },
  [pscustomobject]@{
    Key = "summary"; Source = $SummaryXlsx; PrintArea = '$A$1:$S$26'; Zoom = 93;
    Clear = $summaryClear; Build = "Build-SummaryFields"
  },
  [pscustomobject]@{
    Key = "private-car"; Source = $PrivateCarXlsx; PrintArea = '$A$2:$I$47'; Zoom = 100;
    Clear = $privateClear; Build = "Build-PrivateCarFields"
  }
)

$tempRoot = Join-Path $env:TEMP ("kefeng-reimbursement-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $null

try {
  $allFields = [ordered]@{}

  foreach ($spec in $specs) {
    $tempXlsx = Join-Path $tempRoot ("$($spec.Key).xlsx")
    Copy-Item -LiteralPath $spec.Source -Destination $tempXlsx -Force

    $workbook = $excel.Workbooks.Open($tempXlsx)
    $worksheet = $workbook.Worksheets.Item(1)
    # The sample workbooks already use A4 portrait with the expected margins.
    # Setting PaperSize/Orientation/margins requires a printer driver in some
    # environments, so only override Zoom and the print area here.
    $pageSetup = $worksheet.PageSetup
    $pageSetup.Zoom = [int]$spec.Zoom
    $pageSetup.PrintArea = $spec.PrintArea

    foreach ($address in $spec.Clear) {
      $worksheet.Range($address).ClearContents() | Out-Null
    }

    $printRange = $worksheet.Range($spec.PrintArea)
    $printLeft = [double]$printRange.Left
    $printTop = [double]$printRange.Top
    $scale = [double]$spec.Zoom / 100.0

    $fields = & $spec.Build $worksheet $printLeft $printTop $scale

    $pdfPath = Join-Path $OutputDir ("$($spec.Key).pdf")
    $workbook.ExportAsFixedFormat(0, $pdfPath, 0, $true, $false) | Out-Null

    $allFields[$spec.Key] = [pscustomobject][ordered]@{
      template = "$($spec.Key).pdf"
      zoom = $scale
      pageWidth = $PageWidth
      pageHeight = $PageHeight
      fields = $fields
    }

    Write-Output ("Generated {0} (zoom {1}%)" -f $pdfPath, $spec.Zoom)
    $workbook.Close($false)
    $workbook = $null
  }

  $json = $allFields | ConvertTo-Json -Depth 40
  $fieldsPath = Join-Path $OutputDir "fields.json"
  [System.IO.File]::WriteAllText($fieldsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output "Generated $fieldsPath"
}
finally {
  if ($null -ne $workbook) {
    try { $workbook.Close($false) } catch { }
  }
  try { $excel.Quit() } catch { }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
}
