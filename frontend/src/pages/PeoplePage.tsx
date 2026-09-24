/**
 * /people — who Bob works for (W4.5).
 *
 * PEOPLE IN THE RAIL USED TO OPEN /settings, which is store filters, display
 * names and a cache button: nothing on it is about a person. The people
 * themselves — Joy, Isaiah, Daniel and Elijah (W2.2, `george.people`) — were
 * readable only half way down the Needs you page, and the screen that holds
 * the accounts and page access, /admin/page-access, was reachable from
 * nothing in the ROOM: its only way in is the Admin item in the legacy
 * Supabot chrome (`components/Layout.tsx`), which Bob's rail never shows.
 * Three places for one subject. This is the one.
 *
 * EVERY WORD ABOUT AUTHORITY IS THE SERVER'S. A person's role, what that role
 * may do and which businesses they answer for are `metrics.yaml authority`,
 * carried on the row (`role_says`, `says`, `businesses_say`). Whether anybody
 * can actually approve is `state.approval`, a sentence
 * `services/authority.py describe_approval` writes — because an approver
 * linked to no login is a queue nobody can ever empty, and the page must say
 * so plainly rather than draw a list that looks complete.
 *
 * LINKING A LOGIN TO A PERSON STAYS AN ADMINISTRATOR'S ACT. The control is
 * drawn only for a viewer the server says may do it (`viewer.may_link_people`),
 * the refusal is the server's sentence rendered verbatim, and PUT
 * /bob/authority/people/{key} checks again regardless of what is on screen.
 * Bob holds no credential for any of it (CLAUDE.md rule 4).
 *
 * NOBODY IS INVENTED TO FILL THE PAGE, and no count is drawn: the page says
 * when it was read (UI rule 6), and loading, failed and loaded are three
 * different renderings (UI rule 8).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoomHead } from '../room/RoomShell';
import { loginSays, peopleView, type PeopleQuery } from '../components/bob/peopleView';
import { getAuthority, linkPerson } from '../services/authorityApi';
import { errorMessage } from '../services/pinsApi';
import { useAuthStore } from '../stores/authStore';
import type { Account, AuthorityState, Person } from '../types/authority';

/** "22 Sep, 9:04 am", in Manila — the one timezone this app thinks in. */
function manila(iso: string | null): string {
  if (!iso) return 'not read yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

/** One account, as the administrator picks it from the list. */
function accountLabel(a: Account): string {
  const name = a.display_name && a.display_name !== a.username ? ` — ${a.display_name}` : '';
  const cannot = a.can_sign_in ? '' : ' (no passcode)';
  const off = a.active ? '' : ' (inactive)';
  return `${a.username}${name}${off}${cannot}`;
}

/**
 * The link control, for an administrator only.
 *
 * A pick from the accounts the server sent, not a username typed from memory:
 * a misspelt login linked a person to nothing and said nothing was wrong.
 */
function LinkLogin({ person, accounts, onRefused }: {
  person: Person; accounts: Account[]; onRefused(said: string | null): void;
}) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState('');
  const linker = useMutation({
    mutationFn: (username: string | null) => linkPerson(person.person, username),
    onSuccess: (next: AuthorityState) => { onRefused(null); qc.setQueryData(['authority'], next); },
    onError: (err) => onRefused(errorMessage(err)),
  });

  return (
    <div className="r-row-acts r-people-link">
      <label className="r-src" htmlFor={`login-${person.person}`}>Login</label>
      <select id={`login-${person.person}`} className="r-field" value={choice}
              aria-label={`Login for ${person.name}`}
              onChange={(e) => setChoice(e.target.value)}>
        <option value="">{person.username ? `${person.username} — linked now` : 'nobody'}</option>
        {accounts.map((a) => (
          <option key={a.username} value={a.username}>{accountLabel(a)}</option>
        ))}
      </select>
      <button type="button" className="r-act" disabled={!choice || linker.isPending}
              onClick={() => linker.mutate(choice)}>Link</button>
      {person.username && (
        <button type="button" className="r-act" disabled={linker.isPending}
                onClick={() => { setChoice(''); linker.mutate(null); }}>Unlink</button>
      )}
    </div>
  );
}

function PersonRow({ person, accounts, onRefused }: {
  person: Person; accounts: Account[] | null; onRefused(said: string | null): void;
}) {
  return (
    <li className="r-people-row">
      <p className="r-item-name">{person.name}</p>
      {/* The yaml's words for who this is and what the role may do. */}
      {person.says && <p className="r-note">{person.says}</p>}
      {person.role_says && <p className="r-src">{person.role} — {person.role_says}</p>}
      {person.businesses_say.length > 0 && (
        <p className="r-src">{person.businesses_say.join(' · ')}</p>
      )}
      <p className="r-src">{loginSays(person)}</p>
      {accounts && (
        <LinkLogin person={person} accounts={accounts} onRefused={onRefused} />
      )}
    </li>
  );
}

export default function PeoplePage() {
  const [refused, setRefused] = useState<string | null>(null);
  const mayAdmin = useAuthStore((s) => s.user?.allowed_pages.includes('admin') ?? false);
  const authority = useQuery({
    queryKey: ['authority'],
    queryFn: getAuthority,
    staleTime: 30_000,
    retry: false,
  });

  const query: PeopleQuery = authority.isPending
    ? { status: 'pending' }
    : authority.isError
      ? { status: 'error', said: errorMessage(authority.error) }
      : { status: 'success', state: authority.data };
  const view = peopleView(query);

  return (
    <>
      <RoomHead
        title="People"
        says="Who works on the estate, what each may do, and which login is whose."
      />

      {/* No number on this page stands without the time it was read. */}
      {view.readAt && <p className="r-src">Read {manila(view.readAt)}</p>}

      {/* Whether anybody can approve at all, in the server's words, ABOVE the
          list — because a list of four people reads as though the estate is
          staffed even when no login is linked to any of them. */}
      {view.approval && <p className="r-say r-people-stands">{view.approval}</p>}

      {(view.kind === 'loading' || view.kind === 'failed' || view.kind === 'nobody') && (
        <div className="r-empty">
          <p className={view.kind === 'loading' ? 'r-note' : 'r-say'}>{view.heading}</p>
          {view.detail && <p className="r-note" style={{ marginTop: 6 }}>{view.detail}</p>}
        </div>
      )}

      {refused && <p className="r-note r-people-stands">{refused}</p>}

      <ul className="r-people">
        {view.rows.map((p) => (
          <PersonRow key={p.person} person={p} accounts={view.accounts}
                     onRefused={setRefused} />
        ))}
      </ul>

      {view.kind === 'people' && (
        <p className="r-src r-people-foot">
          {view.mayLink
            ? 'Linking a login to a person is an administrator’s act, and you are one.'
            : 'Linking a login to a person is an administrator’s act.'}
        </p>
      )}

      {/* THE WAY IN FROM THE ROOM. Accounts, roles and which pages each role
          may open live on /admin/page-access, whose only other way in is the
          Admin item in the legacy Supabot chrome. It is behind its own page
          key, so this is drawn only for a role that has it — a link that
          bounces is worse than no link. */}
      {mayAdmin && (
        <p className="r-people-foot">
          <Link className="r-act" to="/admin/page-access">Accounts and page access</Link>
        </p>
      )}

      {view.kind === 'people' && (
        <p className="r-src r-people-foot">{authority.data?.assumption}</p>
      )}
    </>
  );
}
