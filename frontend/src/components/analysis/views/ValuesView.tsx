import { ValuesExplorerView } from '../values-explorer/ValuesExplorerView'

export function ValuesView({
  jsonInput,
  flattenNestedArrays,
}: {
  jsonInput: string
  flattenNestedArrays: boolean
}) {
  return (
    <section className="values-view" aria-label="Values result view">
      <ValuesExplorerView jsonInput={jsonInput} flattenNestedArrays={flattenNestedArrays} />
    </section>
  )
}
