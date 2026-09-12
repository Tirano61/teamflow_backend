# TeamFlow Backend — Claude Code Project Context

## 1. Project overview

TeamFlow is a multi-organization collaborative work management platform.

It allows organizations and teams to organize their work, structure operational areas, manage discussions, assign responsibilities, track workflow states, collaborate around ongoing activities, and maintain shared context around the work being performed.

TeamFlow is intended to support different types of organizations and operational workflows.

It is NOT limited to software development teams.

The meaning of concepts such as WorkModule, Component, Discussion, Assignment and workflow state depends on how each organization uses TeamFlow. Do not assume they represent software applications, software components, bugs or programming tasks unless the specific feature explicitly establishes that meaning.

The backend is built with:

* NestJS
* TypeScript
* TypeORM
* PostgreSQL
* JWT authentication
* Role-based authorization

Database hosting is PostgreSQL on Neon.

During development TypeORM currently uses:

* `synchronize: true`

Do not introduce migrations unless explicitly requested.


---

## 2. Core architecture

TeamFlow is MULTI-ORGANIZATION / MULTI-TENANT.

Main concepts:

- User
- Organization
- Membership
- OrganizationInvitation
- Workspace
- WorkModule
- Component
- Tag
- Discussion
- DiscussionMessage
- DiscussionAssignment

A User belongs to an Organization through Membership.

Never assume that a User belongs to only one Organization.

The backend is stateless regarding the "active organization".

The frontend selects an organization and sends its `organizationId` through tenant-scoped routes.

---

## 3. Membership roles

Current organization roles:

- OWNER
- ADMIN
- DEVELOPER
- MEMBER

Membership status must be ACTIVE when accessing organization resources.

Authorization rules must be enforced by the backend.

Frontend visibility checks are UX only and must NEVER replace backend authorization.

Do not allow OWNER to be assigned through normal organization invitations.

---

## 4. Multi-tenant security

Tenant isolation is critical.

Workspace routes follow this structure:

`/organizations/:organizationId/workspace/...`

Before accessing organization-scoped resources:

1. Authenticate the user.
2. Validate ACTIVE membership in `organizationId`.
3. Validate the required role when applicable.
4. Query tenant resources using `organizationId`.

Never trust a resource ID by itself.

Avoid IDOR vulnerabilities.

When retrieving, updating or deleting tenant resources, queries must be scoped by the organization whenever applicable.

Example principle:

BAD:
`findOne({ where: { id } })`

GOOD:
query using both the resource id and organization context.

Cross-tenant access must never expose whether a resource exists in another organization.

---

## 5. Workspace terminology

Legacy terminology was removed.

Use:

- Workspace
- WorkModule
- Component

Do NOT introduce domain terminology such as:

- Develop Workflow
- Application (when referring to WorkModule)
- Indicator (when referring to Component)

Exceptions are legitimate framework/MIME terminology such as:

- `application/json`
- `application/octet-stream`

---

## 6. Workspace routes

Tenant Workspace base:

`/organizations/:organizationId/workspace`

Main resources include:

- modules
- components
- tags
- developers
- discussions
- discussion messages
- discussion assignments
- discussion context

Discussion context can include:

- modules
- components
- tags

Use the existing route conventions before adding new endpoints.

Some resources are intentionally GLOBAL and must NOT receive an organizationId:

- `/workspace/devices`
- `/workspace/notifications`
- `/workspace/notifications/test`

Authentication remains global:

- `/auth/login`

Do not move global resources under an organization unless explicitly requested.

---

## 7. Organizations and memberships

Organization-related functionality already exists.

Relevant concepts include:

- create organization
- organization memberships
- ACTIVE membership validation
- organization roles
- organization invitations
- `/me/context`

`GET /me/context` provides the frontend with the authenticated user's organizations and pending invitations.

The backend does NOT maintain or persist the user's active organization.

---

## 8. Internal organization invitations

Organization invitations are application-internal invitations to a specific registered User.

New invitations use:

`userId`

not an arbitrary email entered by the inviter.

Creation:

`POST /organizations/:organizationId/invitations`

Body:

{
  "userId": "<uuid>",
  "role": "MEMBER | DEVELOPER | ADMIN"
}

OWNER cannot be assigned through this flow.

Only OWNER or ADMIN may manage invitations.

New invitations store an `invitedUser`.

The email field remains for compatibility with legacy invitations.

Legacy email invitations must continue working unless explicitly removed in a future migration.

Invitation states include:

- PENDING
- ACCEPTED
- EXPIRED
- CANCELLED

Do not delete cancelled invitations merely to represent cancellation.

---

## 9. User search

Authenticated users can search registered users through:

`GET /users/search`

Current behavior:

- `q` required
- minimum 2 characters
- partial case-insensitive search
- searches email and fullName
- only active users
- excludes the authenticated user
- default limit 10
- maximum limit 25

Responses must expose only the fields required by the UI.

Do not expose password hashes or unnecessary user information.

---

## 10. Invitation administration

OWNER/ADMIN can list organization invitations:

`GET /organizations/:organizationId/invitations`

OWNER/ADMIN can cancel a PENDING invitation:

`POST /organizations/:organizationId/invitations/:invitationId/cancel`

Cancellation changes status to CANCELLED.

It does not delete the invitation or modify Membership.

Cancellation must be tenant-safe and concurrency-safe.

An invitation that is no longer PENDING must not be silently cancelled.

---

## 11. Invitation acceptance

Acceptance uses the invitation token.

The invitation must belong to the authenticated invited user.

Validate:

- invitation exists
- status is PENDING
- invitation is not expired
- authenticated user is the invited user
- user does not already belong to the organization

On success:

- create ACTIVE Membership
- use invitation role
- mark invitation ACCEPTED
- set acceptedAt

Keep compatibility with legacy email invitations unless explicitly instructed otherwise.

---

## 12. Workspace domain

Important Workspace concepts:

### WorkModule
Formerly Application.

### Component
Formerly Indicator.

### Tag
Used for categorization.

### Discussion
Central work item.

Discussions can be associated with:

- WorkModules
- Components
- Tags

Discussion statuses represent the workflow / Kanban state.

Discussion types include concepts such as:

- error
- idea
- question/query
- improvement

### DiscussionMessage

Discussion messages can contain different content types, including:

- text
- images/files
- audio

Do not introduce WebSockets for discussions unless explicitly requested.

Push notifications are used for notification behavior.

---

## 13. API contracts

Do not casually change existing HTTP contracts.

Before modifying an existing endpoint:

1. Inspect its controller.
2. Inspect its DTOs.
3. Inspect its service.
4. Inspect existing frontend usage when available.
5. Inspect the endpoint documentation.
6. Inspect Postman coverage.

Preserve compatibility unless the task explicitly requests a contract change.

---

## 14. Endpoint documentation — MANDATORY

Whenever an endpoint is:

- added
- modified
- renamed
- removed
- given new request parameters
- given a different response
- given different permissions
- given new relevant error behavior

update:

`docs/workspace-endpoints.md`

The documentation must reflect the REAL implemented behavior.

Do not document hypothetical behavior.

---

## 15. Postman — MANDATORY

Whenever an endpoint is added or its contract/behavior changes, update:

`docs/workspace.postman_collection.json`

Do not create a second collection.

Extend the existing collection.

Reuse existing variables whenever possible.

Add variables only when necessary.

Include useful success and failure scenarios, especially:

- authentication
- authorization
- tenant isolation
- invalid input
- conflict cases
- cross-organization access when relevant

Keep requests in a logical execution order when they depend on previous variables.

---

## 16. Error handling

Use the project's existing NestJS exception conventions.

Prefer meaningful HTTP semantics:

- 400 invalid request/domain validation
- 401 unauthenticated
- 403 authenticated but unauthorized
- 404 resource unavailable in the current scope
- 409 conflict with current resource state

Do not expose cross-tenant information through error differences.

Before inventing a new error convention, inspect existing services.

---

## 17. Coding rules

Follow the existing architecture and naming.

Do not perform unrelated refactors.

Do not rename unrelated files.

Do not introduce dependencies unless necessary.

Do not change formatting across unrelated files.

Do not run commands that auto-format the entire repository.

Keep diffs focused on the requested task.

---

## 18. Validation after changes

For backend changes run:

`npx tsc --noEmit`

and:

`npm run build`

Do NOT run repository-wide lint with `--fix` if it will reformat unrelated files.

If lint is useful, run it only against relevant files without automatic fixing.

Do not add or run tests unless explicitly requested.

---

## 19. Before implementing a task

Inspect the existing implementation first.

Do not assume a requested feature is missing.

If it already exists:

- verify it
- explain what is already implemented
- change only what is actually missing

Do not duplicate existing services, endpoints, DTOs or features.

---

## 20. Completion report

After completing a task, report concisely:

1. Files created/modified.
2. Architecture/implementation decisions.
3. Endpoints added or modified.
4. Permissions and tenant isolation.
5. API request/response changes.
6. Error handling.
7. Documentation changes.
8. Postman changes.
9. Build/TypeScript result.
10. Anything intentionally left out of scope.

Do not claim something was implemented unless it actually exists in the code.


## API documentation and Postman — MANDATORY

The backend repository contains two canonical API references:

* `docs/workspace-endpoints.md`
* `docs/workspace.postman_collection.json`

These files are part of the backend contract and must remain synchronized with the implementation.

Whenever an endpoint is:

* added
* modified
* renamed
* removed
* given new parameters
* given a different request body
* given a different response body
* given different authorization rules
* given different validation behavior
* given new relevant HTTP error behavior

Claude MUST update BOTH:

1. `docs/workspace-endpoints.md`
2. `docs/workspace.postman_collection.json`

### `docs/workspace-endpoints.md`

This file must document the real current API contract, including where applicable:

* HTTP method
* route
* authentication requirements
* organization/tenant scope
* required Membership roles
* path parameters
* query parameters
* request body
* response body
* relevant HTTP status codes
* important validation or conflict behavior

Do not document hypothetical or planned behavior.

### `docs/workspace.postman_collection.json`

This is the canonical Postman collection for the project.

When API behavior changes:

* update the existing request if the endpoint already exists
* add the request if the endpoint is new
* remove or rename requests when the endpoint is removed or renamed
* reuse existing environment/collection variables whenever possible
* add relevant successful and failure scenarios
* preserve logical request ordering when later requests depend on variables created by previous requests

Do NOT create another Postman collection.

### Before finishing a backend task

If the task touched the HTTP API, verify that:

* implementation
* `docs/workspace-endpoints.md`
* `docs/workspace.postman_collection.json`

all describe the same contract.

The task is NOT considered complete if API behavior changed and either of these two files was not updated.
