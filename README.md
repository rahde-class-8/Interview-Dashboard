# Recruiter Call + Interview Intelligence Dashboard

A frontend prototype that helps job seekers organize recruiter phone-call notes,
attach recordings made with other apps, track opportunities through a hiring
pipeline, and prepare for interviews. It also includes a preview of shared
collaboration.

> **Prototype status:** runs entirely in the browser on fictional mock data.
> No backend, database, authentication or AI. All sample companies, contacts and
> conversations are fictional.

## Technology stack

- [Next.js 15](https://nextjs.org) (App Router) + React 19
- TypeScript (strict)
- Tailwind CSS v4
- [shadcn/ui](https://ui.shadcn.com) components (Radix primitives via `radix-ui`)
- Lucide React icons
- State: React Context + `useReducer` (no external state library)

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command                | Purpose                       |
| ---------------------- | ----------------------------- |
| `npm run dev`          | Start the development server  |
| `npm run build`        | Production build              |
| `npm run start`        | Serve the production build    |
| `npm run lint`         | ESLint                        |
| `npx tsc --noEmit`     | TypeScript type check         |

### Configuration

Copy `.env.example` to `.env.local` to override defaults:

| Variable                             | Default | Meaning                                |
| ------------------------------------ | ------- | -------------------------------------- |
| `NEXT_PUBLIC_MAX_RECORDING_SIZE_MB`  | `100`   | Max size of an attached recording (MB) |

## Application structure

```
src/
├── app/                    # Routes (thin wrappers around feature pages)
│   ├── page.tsx            # Overview dashboard
│   ├── calls/              # List, new, [callId] (view / ?edit=1 / ?tab=)
│   ├── opportunities/      # List (?stage=), [opportunityId]
│   ├── interviews/  preparation/  questions/  shared/  settings/
│   ├── error.tsx  not-found.tsx
├── components/
│   ├── layout/             # App shell, sidebar, mobile nav, header, global search
│   ├── shared/             # Reusable app components (Field, EmptyState, StageBadge…)
│   └── ui/                 # shadcn/ui primitives
├── features/               # Feature modules (page components + feature UI)
│   ├── overview/  calls/  recordings/  opportunities/
│   ├── interviews/  preparation/  questions/  collaboration/  settings/
├── data/mock-data.ts       # Fictional, relative-date sample dataset
├── lib/
│   ├── store/              # Provider + reducer, selectors, useActions
│   ├── format.ts  id.ts  utils.ts
├── hooks/                  # useNow
└── types/index.ts          # Domain models
```

### Data architecture

- **Models** (`src/types`): records reference each other by ID. A company has
  many opportunities, and an opportunity has many calls, interviews, follow-ups
  and prep tasks. A call can have many recording attachments.
- **Store** (`src/lib/store/app-store.tsx`): a single `useReducer` with the full
  `AppData` shape. It initializes on the client, which also gives every page a
  loading state.
- **Selectors** (`selectors.ts`): pure, derived views. Dashboard metrics are
  computed from records, never hardcoded.
- **Actions** (`use-actions.ts`): every mutation the UI performs, such as
  `saveCall`, `setOpportunityStage` and `toggleFollowUp`. This is the seam for a
  backend.

## Implemented features

- **Overview**: metric cards (calls, active opportunities, upcoming interviews,
  pending/overdue follow-ups), recent calls, pipeline by stage, upcoming prep
  tasks, frequently mentioned skills.
- **Recruiter calls**: search by recruiter, company or title; filter by
  opportunity status; table on desktop and cards on mobile; create, view, edit
  and delete (with confirmation). A tabbed form covers contact, job, requirements,
  interview intelligence, follow-up and notes. An error summary links each error
  to its field.
- **Recording attachments**: MP3/M4A/WAV picker with drag and drop, type and
  size validation, file details, status messages, and a custom player (play,
  seek, ±15 s, speed, mute, progress). Replace and remove are supported. Object
  URLs are revoked on replace, remove and unmount. The app never asks for the
  microphone.
- **Opportunities**: stage filter and search; create and edit dialog; a
  clickable pipeline stepper (New → Recruiter Screen → Technical → Hiring
  Manager → Offer → Closed); related calls, interviews and follow-ups; combined
  recruiter intelligence.
- **Interview preparation**: per-opportunity workspace with a checklist (add,
  edit, complete, delete), technical topics and matched practice questions,
  behavioral themes, STAR stories, interview notes, and recruiter advice.
- **Question bank**: technical, behavioral and company-specific questions
  (AWS, Terraform, Linux, Docker, cloud architecture and more). Filter by
  category, topic and company, search, and edit answer notes inline.
- **Interviews & follow-ups**: upcoming and past interviews with inline
  status and outcome; follow-ups with pending/completed filters and overdue
  flags.
- **Shared workspace (preview)**: collaborators, an invite dialog,
  Viewer/Commenter/Editor roles, shared notes, comments, and activity history.
- **Global search** in the header, plus a responsive layout with a mobile
  drawer, skip link, and keyboard-accessible components throughout.

## Prototype limitations

- **No persistence.** Data lives in memory. A page reload restores the sample
  dataset. Nothing is written to browser storage.
- **Recordings are local previews only.** Selected files stay in the tab's
  memory and are never uploaded. After a reload they must be re-selected. Sample
  attachments are metadata-only and show "File not loaded in this session".
- **Collaboration is visual only.** Invites are not emailed, roles and
  permissions are not enforced, and nothing is shared or synchronized.
- **No authentication.** The current user is a fictional sample profile.
- Validation runs on the client only; a backend must re-validate.
- Light mode only. Theme tokens include dark values, but there is no toggle yet.
- Deleting an opportunity cascades to its calls, recordings, interviews,
  follow-ups and prep tasks.

## Future backend integration plan

1. **API layer:** add `src/lib/api/` with typed fetchers that match the models
   in `src/types`. In `useActions`, call the API, then dispatch the existing
   reducer action on success. That gives optimistic or confirmed updates with no
   component changes.
2. **Initial load:** replace `createMockData()` in `AppStoreProvider` with an
   API fetch. The `loading`/`error` states and `DataGate` already handle this.
   Consider route-level data fetching later if the dataset grows.
3. **Recordings:** upload with signed URLs to object storage, set
   `storage: "remote"` and `remoteUrl`, and let `AudioPlayer` play the remote
   URL. Validate type and size on the server and add progress reporting. Keep
   the local preview until the upload is confirmed.
4. **Auth and permissions:** add an auth provider, then enforce workspace roles
   (viewer/commenter/editor) on the server and hide actions the user cannot
   perform.
5. **Collaboration:** send real invite emails and add real-time co-editing for
   shared notes (for example, a CRDT/Yjs-backed service) with presence.
6. **Sensitive data:** recruiter notes and recordings are personal data. Encrypt
   them at rest, define a retention policy, and add export and delete options.
