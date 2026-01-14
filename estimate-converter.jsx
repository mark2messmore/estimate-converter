import React, { useState, useCallback } from 'react';
import { Upload, Copy, Check, Loader2, FileSpreadsheet, X } from 'lucide-react';

export default function EstimateConverter() {
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const processFile = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      const isPdf = f.type === 'application/pdf';
      
      setFile({ base64, type: f.type, isPdf });
      setFileName(f.name);
      setFilePreview(isPdf ? null : e.target.result);
      setData(null);
      setError(null);
    };
    reader.readAsDataURL(f);
  };

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (f) processFile(f);
  };

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let item of items) {
        if (item.type.startsWith('image/')) {
          processFile(item.getAsFile());
          break;
        }
      }
    }
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith('image/') || f.type === 'application/pdf')) {
      processFile(f);
    }
  };

  const extractData = async () => {
    if (!file) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const contentArray = [];
      
      if (file.isPdf) {
        contentArray.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: file.base64
          }
        });
      } else {
        contentArray.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type,
            data: file.base64
          }
        });
      }
      
      contentArray.push({
        type: "text",
        text: `Extract all line items from this estimate/invoice/quote and return ONLY a JSON array. Each item should have these exact fields:
- ln (line number, integer starting at 1)
- partNum (part number or identifier - use the description/product name if no part number exists)
- partDesc (description of the item/service)
- uom (unit of measure: "EA" for each/individual items, "LOT" for bulk/services/flat fees)
- unitPrice (price per unit as a number)
- qty (quantity as a number)
- lineType (always "Regular" unless specified otherwise)

Return ONLY the JSON array, no other text. Example format:
[{"ln":1,"partNum":"ABC-123","partDesc":"Machining services","uom":"EA","unitPrice":275,"qty":2,"lineType":"Regular"}]`
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: contentArray
          }]
        })
      });

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setData(parsed);
      } else {
        setError('Could not parse the response. Please try again.');
      }
    } catch (err) {
      setError('Error processing file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!data) return;
    
    const rows = data.map(row => 
      `${row.ln}\t${row.partNum}\t${row.partDesc}\t${row.uom}\t${row.unitPrice}\t${row.qty}\t${row.lineType}`
    ).join('\n');
    
    navigator.clipboard.writeText(rows);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    setFile(null);
    setFilePreview(null);
    setFileName('');
    setData(null);
    setError(null);
  };

  return (
    <div 
      className="min-h-screen bg-gray-50 p-6"
      onPaste={handlePaste}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">Estimate → Excel Converter</h1>
          </div>
          <p className="text-gray-600">Upload a PDF or image, extract data, copy to Excel</p>
        </div>

        {!file ? (
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-white hover:border-blue-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg text-gray-600 mb-2">Drop file here, click to upload, or paste image (Ctrl+V)</p>
            <p className="text-sm text-gray-400">Supports PDF, PNG, JPG, WEBP</p>
            <input
              id="fileInput"
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-gray-600">
                  {file.isPdf ? '📄 PDF: ' : '🖼️ Image: '}{fileName}
                </span>
                <button onClick={clearAll} className="text-gray-400 hover:text-red-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {filePreview ? (
                <img 
                  src={filePreview} 
                  alt="Uploaded estimate" 
                  className="max-h-64 mx-auto rounded-lg border"
                />
              ) : (
                <div className="bg-gray-100 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-2">📄</div>
                  <p className="text-gray-600">PDF ready for extraction</p>
                </div>
              )}
            </div>

            {!data && (
              <button
                onClick={extractData}
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Extracting data...
                  </>
                ) : (
                  'Extract Data'
                )}
              </button>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                {error}
              </div>
            )}

            {data && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b">
                  <span className="font-medium text-gray-700">Extracted Data ({data.length} rows)</span>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy for Excel'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Ln #</th>
                        <th className="px-3 py-2 text-left">Part #</th>
                        <th className="px-3 py-2 text-left">Part Desc</th>
                        <th className="px-3 py-2 text-left">UOM</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-left">Line Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{row.ln}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.partNum}</td>
                          <td className="px-3 py-2">{row.partDesc}</td>
                          <td className="px-3 py-2">{row.uom}</td>
                          <td className="px-3 py-2 text-right">${row.unitPrice}</td>
                          <td className="px-3 py-2 text-right">{row.qty}</td>
                          <td className="px-3 py-2">{row.lineType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          Tip: You can paste images directly with Ctrl+V (or Cmd+V on Mac)
        </p>
      </div>
    </div>
  );
}
