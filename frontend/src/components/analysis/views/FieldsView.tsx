import type { FieldPattern } from '../../../lib/commands'
import { formatInteger } from '../../common/format'

export function FieldsView({ fields }: { fields: FieldPattern[] }) {
  if (fields.length === 0) {
    return <p className="muted">No field patterns were found.</p>
  }

  return (
    <section aria-label="Field list view">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Pattern</th>
            <th>Category</th>
            <th>Count</th>
            <th>Sample paths</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.pattern}>
              <td>{field.label}</td>
              <td><code>{field.pattern}</code></td>
              <td>{field.category}</td>
              <td>{formatInteger(field.count)}</td>
              <td>{field.sample_paths.slice(0, 3).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
