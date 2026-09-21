Option Explicit
Dim word, doc, docxPath, pdfPath
docxPath = WScript.Arguments(0)
pdfPath = WScript.Arguments(1)
Set word = CreateObject("Word.Application")
word.Visible = False
word.DisplayAlerts = 0
Set doc = word.Documents.Open(docxPath, False, True)
' 17 = wdExportFormatPDF
doc.ExportAsFixedFormat pdfPath, 17
doc.Close False
word.Quit
Set doc = Nothing
Set word = Nothing
