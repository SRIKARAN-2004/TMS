interface PaginationProps {
  page: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

/**
 * Simple page-number pagination used across every list table (Projects,
 * Tasks, Time Logs). Purely presentational - the caller slices its own
 * array based on `page`; this component just renders the controls and
 * reports which page was clicked.
 */
export default function Pagination({ page, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border text-sm">
      <span className="text-muted">
        Showing {start}-{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <span className="px-2 text-xs text-muted">
          Page {page} of {totalPages}
        </span>
        <button
          className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
