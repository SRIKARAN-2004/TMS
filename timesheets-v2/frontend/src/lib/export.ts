/**
 * Client-side CSV export helper. No backend endpoint needed - the report
 * pages already have all the data loaded (from the same list endpoints
 * used to render the tables), so this just formats it and triggers a
 * browser download.
 */
export function exportToCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])

  // Formula/CSV injection: a value starting with =, +, -, or @ is read as
  // a live formula by Excel/Sheets/LibreOffice when the file is opened -
  // e.g. a time-log comment of '=HYPERLINK("http://evil","click")' would
  // render as a clickable link, and formulas like WEBSERVICE()/IMPORTXML()
  // can exfiltrate data to a remote host. Escaping quotes/commas/newlines
  // (the previous behavior) does nothing to stop this since none of those
  // characters are involved - prefixing with a leading apostrophe forces
  // the cell to be read as literal text instead of evaluated.
  const FORMULA_PREFIX = /^[=+\-@\t\r]/
  const escape = (val: string | number) => {
    let s = String(val ?? '')
    if (FORMULA_PREFIX.test(s)) {
      s = `'${s}`
    }
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ]

  const csvContent = lines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
