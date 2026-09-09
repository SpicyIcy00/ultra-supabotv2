/**
 * Subjects abreast.
 *
 * A COMPARISON ENTERS BESIDE WHAT IS ALREADY THERE. The subject the work
 * started from keeps the left, in the order the work reached them, and the
 * newcomer arrives on the right — the motion says which of the two is new
 * (index.css, .desk-enter). Nothing is summed, differenced or ranked across
 * the columns: each is the same anatomy or the same field it would be alone,
 * drawn at the same size so the eye compares like with like.
 *
 * ONE SCALE, ONE READING. Two fields side by side are drawn from their own
 * rows and captioned with their own scope, because a shared axis across two
 * stores would assert a comparability nobody measured. What makes them
 * comparable is that the same subjects appear in both, and those are linked
 * by the id their rows carried, never by their names.
 */
import { Anatomy } from './Anatomy';
import { Field } from './Field';
import type { AnatomyPlan, FieldPlan } from './deskCompose';
import type { Subject } from './subject';
import { subjectKey } from './subject';

export function Compare({
  subjects, fields, selection, onSelect, reading = [], asList = false,
}: {
  subjects: AnatomyPlan[];
  fields: FieldPlan[];
  selection: Subject[];
  onSelect: (subject: Subject, additive: boolean) => void;
  reading?: Subject[];
  asList?: boolean;
}) {
  if (fields.length > 0) {
    return (
      <div data-compare="fields" className="grid gap-8 md:grid-cols-2">
        {fields.map((field, i) => (
          <div key={`${field.within ?? 'estate'}-${field.headline.source.seq}`} className={i > 0 ? 'desk-enter' : undefined}>
            <p className="desk-label mb-2">{field.within ?? 'All stores'}</p>
            <Field
              field={field}
              selection={selection}
              onSelect={onSelect}
              reading={reading}
              asList={asList}
              height={320}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-compare="subjects" className={`grid gap-10 ${subjects.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {subjects.map((anatomy, i) => (
        <div key={subjectKey(anatomy.subject)} className={i > 0 ? 'desk-enter' : undefined}>
          <Anatomy anatomy={anatomy} size="abreast" />
        </div>
      ))}
    </div>
  );
}
