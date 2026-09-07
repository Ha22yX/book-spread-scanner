# Synthetic book spread for repeatable OCR / split tests; no user book content.
Add-Type -AssemblyName System.Drawing
$fixtureDir = Join-Path $PSScriptRoot '../outputs'
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 1600,1100
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(247,247,241))
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = New-Object System.Drawing.Font 'Microsoft YaHei',26
$titleFont = New-Object System.Drawing.Font 'Microsoft YaHei',35
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28,32,38))
$graphics.DrawString('阅读与思考',$titleFont,$brush,65,70)
$graphics.DrawString('把理解变成行动',$titleFont,$brush,890,70)
$leftLines = @('阅读让我们看见更大的世界。','一本书的价值，不只在于知识，','也在于它让我们重新提出问题。','','放慢阅读速度，留意作者的论据。','有些结论看似自然，','却需要我们认真检查其中的前提。','','学习并不是记住所有的答案，','而是在不断思考中形成自己的判断。')
$rightLines = @('理解需要时间，也需要实践。','当我们将书中的观点用于生活，','抽象的道理才会逐渐变得具体。','','遇到不确定的地方，可以先记录，','再通过讨论和观察寻找证据。','','好的笔记不是原文的简单重复，','而是写下自己的疑问与发现。','每一次阅读，都可以成为新的起点。')
$y = 175
foreach($line in $leftLines){$graphics.DrawString($line,$font,$brush,65,$y);$y+=70}
$y = 175
foreach($line in $rightLines){$graphics.DrawString($line,$font,$brush,890,$y);$y+=70}
for($x=790;$x -le 860;$x++){$shade=[int](247-160*[Math]::Exp(-[Math]::Pow(($x-825)/12,2)));$pen=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($shade,$shade,$shade));$graphics.DrawLine($pen,$x,0,$x,1099);$pen.Dispose()}
$bitmap.Save((Join-Path $fixtureDir 'test-spread.jpg'),[System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose();$bitmap.Dispose();$font.Dispose();$titleFont.Dispose();$brush.Dispose()
Write-Output 'Synthetic fixture generated.'
