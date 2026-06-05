import type { ExactDuplicatesResult } from '../../../lib/commands'
import { ExactDuplicatesView } from './ExactDuplicatesView'

export function DuplicatesView({ duplicates }: { duplicates: ExactDuplicatesResult }) {
  return (
    <section className="duplicates-view" aria-label="Duplicates result view">
      <ExactDuplicatesView duplicates={duplicates} />
    </section>
  )
}
