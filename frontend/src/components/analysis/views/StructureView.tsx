import type { SchemaNode, StructureAnalysis } from '../../../lib/commands'
import { formatInteger } from '../../common/format'
import { Metric } from '../../common/Metric'

export function StructureView({ structure }: { structure: StructureAnalysis }) {
  return (
    <section aria-label="Structure view">
      <div className="metric-grid compact-metrics">
        <Metric label="Type" value={structure.type} />
        <Metric label="Size" value={formatInteger(structure.size)} />
        <Metric label="Depth" value={formatInteger(structure.depth)} />
        <Metric label="Top-level size" value={formatInteger(structure.top_level_size)} />
      </div>
      <h3>Field paths</h3>
      <ul className="path-list">
        {structure.field_paths.slice(0, 24).map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
      {structure.field_paths.length > 24 ? <p className="muted">Showing first 24 field paths.</p> : null}
      <h3>Schema preview</h3>
      <SchemaPreview schema={structure.schema} />
    </section>
  )
}

function SchemaPreview({ schema }: { schema: SchemaNode }) {
  return (
    <ul className="schema-tree">
      <li>
        <strong>{schema.type}</strong>
        {schema.length !== null && schema.length !== undefined ? <span> length {schema.length}</span> : null}
        {schema.properties.length > 0 ? (
          <ul>
            {schema.properties.map((property) => (
              <li key={property.name}>
                <span>{property.name}: </span>
                <SchemaPreview schema={property.schema} />
              </li>
            ))}
          </ul>
        ) : null}
        {schema.items ? (
          <ul>
            <li>
              <span>items: </span>
              <SchemaPreview schema={schema.items} />
            </li>
          </ul>
        ) : null}
      </li>
    </ul>
  )
}
