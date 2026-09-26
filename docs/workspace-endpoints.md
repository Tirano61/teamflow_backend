# TeamFlow Backend Endpoints

Base URL:
- http://localhost:3000/api/v1

Autenticacion:
- Usuario autenticado: requiere JWT Bearer valido.
- Membership ACTIVE: ademas del JWT, requiere Membership `ACTIVE` del usuario autenticado en el `:organizationId` de la ruta.
- Membership ACTIVE + OWNER/ADMIN: ademas de lo anterior, el role de esa Membership debe ser `OWNER` o `ADMIN`.
- Membership ACTIVE + OWNER/ADMIN/DEVELOPER: role de gestion de Discussions (status, asignaciones y relaciones de contexto). Ver "Workspace: Discussions (reglas comunes)".

Autorizacion tenant:
- Los permisos sobre recursos de una organization se resuelven con la Membership del usuario en el `:organizationId` de la ruta.
- Ningun endpoint de Workspace depende del rol global `developer` del `User` (`roles`, usado solo por los endpoints de administracion de `/auth`).
- El backend no persiste una organization activa: la organization siempre llega por la ruta.
- Una Membership `SUSPENDED` no tiene acceso tenant aunque conserve role `OWNER` o `ADMIN`.
- Una Membership `LEFT` (el usuario abandono la organization con `POST /organizations/:organizationId/leave`) tampoco tiene acceso tenant: recibe 403 igual que si nunca hubiera pertenecido.

## Auth

### POST /auth/users
- Auth: Publico
- Descripcion: Crea un usuario basico y retorna datos de usuario con token JWT.
- Body:
```json
{
  "email": "admin@teamflow.com",
  "password": "Admin123",
  "fullName": "Admin TeamFlow"
}
```

### POST /auth/register
- Auth: Publico
- Descripcion: Alias funcional de creacion de usuario con la misma validacion y respuesta de `/auth/users`.

### POST /auth/login
- Auth: Publico
- Descripcion: Inicia sesion y retorna token JWT.

### GET /auth/validate
- Auth: Usuario autenticado
- Descripcion: Valida token actual y retorna datos del usuario autenticado.

## Users

### GET /users/search
- Auth: Usuario autenticado
- Descripcion: Busca usuarios registrados de TeamFlow por `email` o `fullName` para poder invitarlos a una organization.
- Query params:
  - `q` (requerido): texto de busqueda, minimo 2 caracteres. Coincidencia parcial e insensible a mayusculas sobre `email` y `fullName`.
  - `limit` (opcional): default `10`, maximo `25`.
- Filtros aplicados por backend:
  - solo usuarios con `isActive = true`
  - excluye al propio usuario autenticado
  - orden por `fullName` ascendente
- Ejemplo: `GET /users/search?q=dar&limit=10`
- Respuesta:
```json
[
  {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "dario@teamflow.com",
    "fullName": "Dario Ramirez"
  }
]
```
- Notas:
  - Nunca retorna `password`, `roles`, `isActive` ni otros campos internos.
  - Si `q` tiene menos de 2 caracteres retorna 400.
  - No lista usuarios sin filtro: `q` es obligatorio.

## Onboarding / Contexto de Usuario

### GET /me/context
- Auth: Usuario autenticado
- Descripcion: Retorna contexto de onboarding del usuario autenticado para decidir flujo post-login.
- Incluye:
  - `user`: id, email, fullName
  - `organizations`: solo memberships `ACTIVE` con id, name, slug, role, joinedAt. Las memberships `SUSPENDED` y `LEFT` (abandono voluntario) no aparecen: una organization que el usuario abandono deja de poder seleccionarse como organization activa hasta que acepte una nueva invitacion.
  - `pendingInvitations`: solo invitaciones pendientes validas dirigidas al usuario autenticado (`invitedUser`)
  - `organizationCount`: cantidad de organizaciones activas
- Notas:
  - No retorna entidades TypeORM completas.
  - No usa ni persiste `activeOrganizationId`.
  - El backend permanece stateless respecto de la organizacion activa.
- Ejemplo:
```json
{
  "user": {
    "id": "f6c7f2b6-0c7d-4f47-b32d-cc6ef3e95ed0",
    "email": "usuario@email.com",
    "fullName": "Usuario"
  },
  "organizations": [
    {
      "id": "org-a",
      "name": "Empresa A",
      "slug": "empresa-a",
      "role": "OWNER",
      "joinedAt": "2026-08-19T20:00:00.000Z"
    }
  ],
  "pendingInvitations": [
    {
      "invitationId": "inv-1",
      "organizationId": "org-b",
      "organizationName": "Empresa B",
      "organizationSlug": "empresa-b",
      "role": "DEVELOPER",
      "expiresAt": "2026-08-26T20:00:00.000Z",
      "token": "token-en-desarrollo"
    }
  ],
  "organizationCount": 1
}
```

## Workspace: catalogos tenant (Modules, Components, Tags)

Los tres catalogos viven bajo la misma base tenant:

`/organizations/:organizationId/workspace`

Regla de autorizacion comun a Modules, Components, Tags y a la relacion WorkModule <-> Component:

| Tipo de operacion | Autorizacion |
| ----------------- | ------------ |
| Lectura | Membership `ACTIVE` en `:organizationId`, con cualquier role (`OWNER`, `ADMIN`, `DEVELOPER`, `MEMBER`) |
| Administracion / escritura | Membership `ACTIVE` en `:organizationId` con role `OWNER` o `ADMIN` |

- La autorizacion se resuelve siempre contra el `:organizationId` de la ruta. **No depende del rol global `developer` del `User`**: un usuario sin rol global puede administrar los catalogos de una organization donde es `OWNER` o `ADMIN`, y un usuario con rol global `developer` no obtiene por eso ningun permiso tenant.
- `DEVELOPER` y `MEMBER` pueden leer, pero reciben 403 en cualquier operacion de administracion.
- Una Membership `SUSPENDED` recibe 403 en todos los endpoints de estas secciones, aunque su role sea `OWNER` o `ADMIN`.
- Todas las consultas se filtran por `organizationId`: dentro de una organization donde el usuario si tiene Membership, un id que pertenece a otra organization responde 404 (`... not found`) y nunca 200, para no revelar su existencia. Si el usuario no tiene Membership `ACTIVE` en la organization de la ruta, la respuesta es 403 y no se llega a buscar el recurso.

Orden de evaluacion de errores:

1. 401 si falta el JWT o no es valido.
2. 400 si `:organizationId` o los ids de la ruta no son UUID, o si el body no pasa la validacion global (`whitelist` + `forbidNonWhitelisted`).
3. 403 si el usuario no tiene Membership en esa organization (`User does not belong to this organization`) o su Membership no esta `ACTIVE` (`Membership is not active`).
4. 403 si la operacion es administrativa y el role no es `OWNER` ni `ADMIN` (`You do not have permission for this action in this organization`).
5. 404 si el recurso no existe dentro de esa organization.
6. 400 en conflictos de dominio (nombre duplicado, relacion ya existente).

## Modules

### GET /organizations/:organizationId/workspace/modules
- Auth: Membership ACTIVE
- Descripcion: Lista solo modules activas de la organization, con sus components asociados.

### GET /organizations/:organizationId/workspace/modules/all
- Auth: Membership ACTIVE
- Descripcion: Lista modules activas e inactivas de la organization.

### GET /organizations/:organizationId/workspace/modules/:id
- Auth: Membership ACTIVE
- Descripcion: Obtiene una module activa por id dentro de la organization.
- Errores: 404 si no existe, si esta inactiva o si pertenece a otra organization.

### GET /organizations/:organizationId/workspace/modules/all/:id
- Auth: Membership ACTIVE
- Descripcion: Obtiene una module por id incluyendo inactivas.
- Errores: 404 si no existe o si pertenece a otra organization.

### POST /organizations/:organizationId/workspace/modules
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Crea una module en la organization de la ruta. La organization se toma del path, nunca del body.
- Body:
```json
{
  "name": "Remoto",
  "description": "Modulo de asistencia remota"
}
```
- Errores:
  - 400 `name` vacio, mayor a 150 caracteres o ya usado en esa organization (comparacion case-insensitive)
  - 403 sin Membership `ACTIVE`, o con role `DEVELOPER` / `MEMBER`

### PATCH /organizations/:organizationId/workspace/modules/:id
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Actualiza `name` y/o `description` de una module de esa organization.
- Body:
```json
{
  "name": "Remoto V2",
  "description": "Descripcion actualizada"
}
```
- Errores:
  - 400 `name` duplicado dentro de la misma organization
  - 403 role insuficiente
  - 404 module inexistente en esa organization

### PATCH /organizations/:organizationId/workspace/modules/:id/active
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Activa o desactiva la module. No existe DELETE fisico de module.
- Body:
```json
{
  "active": false
}
```
- Errores: 403 role insuficiente; 404 module inexistente en esa organization.

## Components

### GET /organizations/:organizationId/workspace/components
- Auth: Membership ACTIVE
- Descripcion: Lista solo components activos de la organization, con sus modules asociadas.

### GET /organizations/:organizationId/workspace/components/all
- Auth: Membership ACTIVE
- Descripcion: Lista components activos e inactivos de la organization.

### GET /organizations/:organizationId/workspace/components/:id
- Auth: Membership ACTIVE
- Descripcion: Obtiene un component activo por id dentro de la organization.
- Errores: 404 si no existe, si esta inactivo o si pertenece a otra organization.

### GET /organizations/:organizationId/workspace/components/all/:id
- Auth: Membership ACTIVE
- Descripcion: Obtiene un component por id incluyendo inactivos.
- Errores: 404 si no existe o si pertenece a otra organization.

### POST /organizations/:organizationId/workspace/components
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Crea un component en la organization de la ruta.
- Body:
```json
{
  "name": "ST-456",
  "description": "Descripcion del component"
}
```
- Errores:
  - 400 `name` vacio, mayor a 150 caracteres o ya usado en esa organization (case-insensitive)
  - 403 sin Membership `ACTIVE`, o con role `DEVELOPER` / `MEMBER`

### PATCH /organizations/:organizationId/workspace/components/:id
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Actualiza `name` y/o `description` de un component de esa organization.
- Body:
```json
{
  "name": "ST-456-NEW",
  "description": "Descripcion actualizada"
}
```
- Errores:
  - 400 `name` duplicado dentro de la misma organization
  - 403 role insuficiente
  - 404 component inexistente en esa organization

### PATCH /organizations/:organizationId/workspace/components/:id/active
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Activa o desactiva el component. No existe DELETE fisico de component.
- Body:
```json
{
  "active": false
}
```
- Errores: 403 role insuficiente; 404 component inexistente en esa organization.

## Relations Module <-> Component

La relacion es administrable solo desde el lado WorkModule.

### POST /organizations/:organizationId/workspace/modules/:moduleId/components/:componentId
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Asocia un component a una module.
- Validacion cross-tenant: la module y el component se buscan por separado filtrando por `organizationId` de la ruta. Si alguno pertenece a otra organization, responde 404 (`Module not found` / `Component not found`). No es posible asociar una module de la organization A con un component de la organization B.
- Errores:
  - 400 la relacion ya existe (`Module and component relation already exists`)
  - 403 role insuficiente
  - 404 module o component inexistente en esa organization

### DELETE /organizations/:organizationId/workspace/modules/:moduleId/components/:componentId
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Elimina la asociacion entre module y component. No elimina ninguno de los dos recursos.
- Errores:
  - 403 role insuficiente
  - 404 module inexistente en esa organization, o relacion inexistente (`Module and component relation not found`)

### GET /organizations/:organizationId/workspace/modules/:moduleId/components
- Auth: Membership ACTIVE
- Descripcion: Lista components activos asociados a una module de esa organization.
- Errores: 404 module inexistente en esa organization.

### GET /organizations/:organizationId/workspace/components/:componentId/modules
- Auth: Membership ACTIVE
- Descripcion: Lista modules activas asociadas a un component de esa organization.
- Errores: 404 component inexistente en esa organization.

## Workspace: Discussions (reglas comunes)

Todas las rutas de Discussions, relaciones de contexto, asignaciones y DiscussionMessages viven bajo la base tenant:

`/organizations/:organizationId/workspace`

No existen rutas `/workspace/discussions...` sin `organizationId`.

Autorizacion (siempre contra la Membership del usuario en el `:organizationId` de la ruta; nunca contra el rol global `developer` del `User`):

| Operacion | Autorizacion |
| --------- | ------------ |
| Listar / ver discussions, marcar como leida, listar developers asignables | Membership `ACTIVE`, cualquier role |
| Crear discussion (incluye `moduleIds`/`componentIds`/`tagIds` iniciales) | Membership `ACTIVE`, cualquier role |
| Editar `title` / `type` (`PATCH .../discussions/:id`) | Membership `ACTIVE` y ser el creador de la discussion, o role `OWNER`/`ADMIN`/`DEVELOPER` |
| Reemplazar contexto en `PATCH .../discussions/:id` (`moduleIds`/`componentIds`/`tagIds`) | Membership `ACTIVE` con role `OWNER`/`ADMIN`/`DEVELOPER` (tambien para el creador) |
| Cambiar status | Membership `ACTIVE` con role `OWNER`/`ADMIN`/`DEVELOPER` |
| Asignaciones (agregar, reemplazar, quitar) | Membership `ACTIVE` con role `OWNER`/`ADMIN`/`DEVELOPER` |
| Relaciones Discussion <-> WorkModule / Component / Tag | Membership `ACTIVE` con role `OWNER`/`ADMIN`/`DEVELOPER` |
| Crear / listar DiscussionMessages (texto o archivo) | Membership `ACTIVE`, cualquier role |
| Editar / eliminar un DiscussionMessage | Membership `ACTIVE` y ser el autor del mensaje (ningun role, ni `OWNER`, puede editar/eliminar mensajes ajenos) |

- En este documento, "role de gestion de Discussions" significa `OWNER`, `ADMIN` o `DEVELOPER`. `MEMBER` puede participar (leer, crear discussions, escribir mensajes, editar `title`/`type` de sus propias discussions), pero recibe 403 `You do not have permission for this action in this organization` en status, asignaciones y relaciones.
- Membership `SUSPENDED`: todas las operaciones pasan por `requireActiveMembership`, por lo que responden 403 `Membership is not active`, aunque el role sea `OWNER` o `ADMIN` y aunque el usuario sea el creador de la discussion o el autor del mensaje.
- Sin Membership en la organization de la ruta: 403 `User does not belong to this organization`, sin llegar a buscar el recurso.

Aislamiento tenant / anti-IDOR:
- La discussion se busca siempre por `id` + `organizationId` de la ruta. Una discussion de otra organization responde 404 `Discussion not found`, igual que una inexistente.
- WorkModules, Components y Tags enviados en body (`moduleIds`, `componentIds`, `tagIds`, `moduleId`, `componentId`, `tagId`) se buscan por `id` + `organizationId`. Un id de otra organization responde 404 (`Module not found...`, `Component not found...`, `Tag not found...`), igual que uno inexistente. No se valida `isActive` de esos catalogos: una WorkModule/Component/Tag inactiva de la misma organization puede asociarse.
- Los DiscussionMessages se resuelven por `messageId` + `discussionId`, y la discussion se valida antes contra `organizationId`. Un mensaje de otra discussion u otra organization responde 404.
- Los developers asignables se resuelven por Membership en la organization de la ruta. Un usuario de otra organization responde 400 `Users not assignable as developers: ...`, igual que un usuario inexistente.
- Los filtros de listado (`moduleIds`, `componentIds`, `tagIds`, `createdBy`, `assignedDeveloperId`) siempre se aplican sobre discussions de la organization de la ruta; ids de otra organization simplemente no producen resultados.

Orden de evaluacion de errores:
1. 401 si falta el JWT, no es valido o el `User` esta inactivo.
2. 400 si `:organizationId` o los ids de la ruta no son UUID, si los query params no pasan sus pipes, o si el body no pasa la validacion global (`whitelist` + `forbidNonWhitelisted`).
3. 403 sin Membership o con Membership no `ACTIVE`.
4. 403 por role, en las operaciones que requieren role de gestion (status, asignaciones, relaciones). En `PATCH .../discussions/:id` y en editar/eliminar mensajes, el control de creador/autor se hace despues de encontrar el recurso (ver cada endpoint).
5. 404 si la discussion (o el mensaje, o el catalogo referenciado) no existe dentro de esa organization.
6. 400 en conflictos de dominio (relacion ya existente, contenido vacio, tipo de mensaje invalido). Este modulo no usa 409.

## Discussions

### POST /organizations/:organizationId/workspace/discussions
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Crea una discussion con estado inicial NEW y createdBy tomado del token. Requiere initialMessageContent y crea el primer DiscussionMessage de tipo TEXT en la misma transaccion. El creador queda marcado como leido.
- Body:
```json
{
  "type": "ERROR",
  "title": "Problema en el proceso de alta",
  "initialMessageContent": "Descripcion inicial del problema",
  "moduleIds": ["{{moduleId}}"],
  "componentIds": ["{{componentId}}"],
  "tagIds": ["{{tagId}}"]
}
```
- `type`: `ERROR | IDEA | IMPROVEMENT | QUESTION`. `title`: 1-150 caracteres (no vacio tras trim). `initialMessageContent`: 1-4000 caracteres (no vacio tras trim). `moduleIds`/`componentIds`/`tagIds`: opcionales, arrays de UUID v4 sin duplicados.
- Respuesta 201: la discussion con `createdBy`, `workModules`, `components`, `tags`, `assignedDevelopers` (`id`, `fullName`, `email`) e `isUnread`.
- Errores:
  - 400 body invalido, `title`/`initialMessageContent` vacios
  - 403 sin Membership `ACTIVE`
  - 404 `Module not found: ...`, `Component not found: ...` o `Tag not found: ...` si algun id no existe en esa organization (incluye ids de otra organization)

### GET /organizations/:organizationId/workspace/discussions
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Lista discussions de la organization, paginadas con filtros, ordenadas por `createdAt` DESC. Cada item incluye `isUnread` calculado para el usuario autenticado.
- Query params opcionales:
  - page (default 1, minimo 1)
  - limit (default 20, minimo 1, maximo efectivo 100)
  - type (ERROR | IDEA | IMPROVEMENT | QUESTION)
  - status (NEW | REVIEW | IN_PROGRESS | RESOLVED)
  - moduleIds (CSV de UUIDs)
  - componentIds (CSV de UUIDs)
  - tagIds (CSV de UUIDs)
  - createdBy (UUID de usuario; se ignora si `mine=true`)
  - mine (true|false)
  - assignedToMe (true|false)
  - assignedDeveloperId (UUID de developer asignado; se ignora si `assignedToMe=true`)
  - unread (true|false)
- Respuesta 200: `{ "data": [...], "page", "limit", "total", "totalPages" }`
- Errores: 400 paginacion invalida, enum invalido, UUID invalido o ids duplicados en un CSV; 403 sin Membership `ACTIVE`.

### GET /organizations/:organizationId/workspace/discussions/:id
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Obtiene una discussion por id con creador, modules, components, tags y developers asignados. Incluye `isUnread` para el usuario autenticado.
- Errores: 403 sin Membership `ACTIVE`; 404 `Discussion not found` (inexistente o de otra organization).

### POST /organizations/:organizationId/workspace/discussions/:id/read
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Marca la discussion como leida para el usuario autenticado (idempotente, usa UPSERT por `(discussion_id, user_id)`).
- Respuesta 201:
```json
{
  "discussionId": "UUID",
  "lastReadAt": "ISO-8601",
  "isUnread": false
}
```
- Errores: 403 sin Membership `ACTIVE`; 404 `Discussion not found`.

### PATCH /organizations/:organizationId/workspace/discussions/:id
- Auth: Membership ACTIVE + (creador de la discussion o role OWNER/ADMIN/DEVELOPER). Cambiar contexto requiere role OWNER/ADMIN/DEVELOPER.
- Descripcion: Actualiza la discussion. Todos los campos son opcionales. `title` y `type` pueden modificarse por el creador (cualquier role) o por `OWNER`/`ADMIN`/`DEVELOPER`. `moduleIds`, `componentIds` y `tagIds` solo por `OWNER`/`ADMIN`/`DEVELOPER`, aunque el usuario sea el creador.
- Reglas de contexto (modules/components/tags):
  - Permite reemplazar completamente asociaciones enviando los arrays.
  - Enviar arrays vacios (`[]`) elimina todas las asociaciones de ese catalogo.
  - Si un id no existe en esa organization (o es de otra organization), responde 404.
  - Si hay ids duplicados, responde 400.
- Body:
```json
{
  "type": "IMPROVEMENT",
  "title": "Titulo actualizado",
  "moduleIds": ["{{moduleId}}"],
  "componentIds": ["{{componentId}}"],
  "tagIds": ["{{tagId}}"]
}
```
- Respuesta 200: la discussion actualizada con sus relaciones (sin `isUnread`).
- Errores (en este orden):
  - 403 sin Membership `ACTIVE`
  - 404 `Discussion not found`
  - 403 `You can only modify your own discussions` si el usuario es `MEMBER` y no es el creador
  - 403 `You do not have permission for this action in this organization` si se envia `moduleIds`/`componentIds`/`tagIds` con role `MEMBER`
  - 400 `title` vacio o body invalido; 404 module/component/tag no encontrado en esa organization

### PATCH /organizations/:organizationId/workspace/discussions/:id/status
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Descripcion: Cambia el estado Kanban de la discussion. No impone flujo lineal de transicion.
- Body:
```json
{
  "status": "IN_PROGRESS"
}
```
- Respuesta 200: la discussion actualizada con sus relaciones.
- Errores: 400 status invalido; 403 sin Membership `ACTIVE` o role `MEMBER`; 404 `Discussion not found`.

### GET /organizations/:organizationId/workspace/developers
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Lista usuarios asignables de la organization (`id`, `fullName`, `email`), ordenados por `fullName`: Membership `ACTIVE` con role `OWNER`, `ADMIN` o `DEVELOPER` y `User.isActive = true`.
- Errores: 403 sin Membership `ACTIVE`.

### POST /organizations/:organizationId/workspace/discussions/:id/assignments
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Descripcion: Agrega developers asignados (sin duplicar los ya asignados).
- Body:
```json
{
  "developerUserIds": ["{{developerUserId}}"]
}
```
- Respuesta 201: la discussion actualizada.
- Errores:
  - 400 body invalido o ids duplicados
  - 403 sin Membership `ACTIVE` o role `MEMBER`
  - 404 `Discussion not found`
  - 400 `Users not assignable as developers: ...` si algun usuario no tiene Membership en esa organization (incluye usuarios de otra organization) o su Membership no esta `ACTIVE`
  - 403 `User cannot receive assignments in this organization` si algun usuario tiene Membership `ACTIVE` con role `MEMBER`

### PUT /organizations/:organizationId/workspace/discussions/:id/assignments
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Descripcion: Reemplaza completamente la coleccion de developers asignados. `[]` quita todas las asignaciones.
- Body:
```json
{
  "developerUserIds": ["{{developerUserId}}"]
}
```
- Respuesta 200: la discussion actualizada.
- Errores: iguales a `POST .../assignments`.

### DELETE /organizations/:organizationId/workspace/discussions/:id/assignments/:developerUserId
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Descripcion: Quita un developer asignado de la discussion.
- Respuesta 200: la discussion actualizada.
- Errores: 403 sin Membership `ACTIVE` o role `MEMBER`; 404 `Discussion not found`; 404 `Discussion assignment not found` si el usuario no estaba asignado.

## Discussion relations (WorkModule, Component, Tag)

Todas requieren Membership ACTIVE + OWNER/ADMIN/DEVELOPER. `MEMBER` recibe 403. Responden con la discussion actualizada (incluye `isUnread`).

### POST /organizations/:organizationId/workspace/discussions/:id/modules
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Body:
```json
{
  "moduleId": "{{moduleId}}"
}
```
- Respuesta 201.
- Errores: 400 `moduleId` no UUID; 403; 404 `Discussion not found`; 404 `Module not found` (inexistente o de otra organization); 400 `Discussion and module relation already exists`.

### DELETE /organizations/:organizationId/workspace/discussions/:id/modules/:moduleId
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Respuesta 200.
- Errores: 403; 404 `Discussion not found`; 404 `Discussion and module relation not found` (incluye WorkModules de otra organization, que nunca pueden estar relacionadas).

### POST /organizations/:organizationId/workspace/discussions/:id/components
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Body:
```json
{
  "componentId": "{{componentId}}"
}
```
- Respuesta 201.
- Errores: 400 `componentId` no UUID; 403; 404 `Discussion not found`; 404 `Component not found` (inexistente o de otra organization); 400 `Discussion and component relation already exists`.

### DELETE /organizations/:organizationId/workspace/discussions/:id/components/:componentId
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Respuesta 200.
- Errores: 403; 404 `Discussion not found`; 404 `Discussion and component relation not found`.

### Nota sobre reemplazo masivo de contexto
- Para reemplazar todas las modules/components/tags de una discussion en una sola operacion, usar `PATCH /organizations/:organizationId/workspace/discussions/:id` con `moduleIds`, `componentIds` y/o `tagIds`.

### POST /organizations/:organizationId/workspace/discussions/:id/tags
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Body:
```json
{
  "tagId": "{{tagId}}"
}
```
- Respuesta 201.
- Errores: 400 `tagId` no UUID; 403; 404 `Discussion not found`; 404 `Tag not found` (inexistente o de otra organization); 400 `Discussion and tag relation already exists`.

### DELETE /organizations/:organizationId/workspace/discussions/:id/tags/:tagId
- Auth: Membership ACTIVE + OWNER/ADMIN/DEVELOPER
- Respuesta 200.
- Errores: 403; 404 `Discussion not found`; 404 `Discussion and tag relation not found`.

## Discussion Messages

Crear y listar mensajes requiere Membership ACTIVE con cualquier role. Editar y eliminar requiere ademas ser el autor. La discussion se valida primero contra la organization de la ruta: si no existe alli, responde 404 `Discussion not found`.

### POST /organizations/:organizationId/workspace/discussions/:discussionId/messages
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Crea un mensaje TEXT dentro de la discussion usando author del token. El autor queda marcado como leido hasta ese momento.
- Body:
```json
{
  "type": "TEXT",
  "content": "Necesitamos revisar este caso"
}
```
- `type` es opcional; si se envia debe ser `TEXT`. `content`: 1-4000 caracteres, no vacio tras trim.
- Respuesta 201: el mensaje con `author` y `discussion`.
- Errores: 400 `type` distinto de `TEXT` o `content` vacio; 403 sin Membership `ACTIVE`; 404 `Discussion not found`.

### POST /organizations/:organizationId/workspace/discussions/:discussionId/messages/files
- Auth: Membership ACTIVE (cualquier role)
- Content-Type: multipart/form-data
- Descripcion: Sube un archivo a Cloudinary y crea un DiscussionMessage de tipo IMAGE, AUDIO, VIDEO o FILE. El autor queda marcado como leido hasta ese momento. Tamano maximo: `WORKSPACE_ATTACHMENT_MAX_FILE_SIZE_BYTES` (default 25 MB).
- Form-data:
  - type (IMAGE | AUDIO | VIDEO | FILE)
  - file (binary)
  - content (opcional, texto adicional, 1-4000 caracteres)
- Respuesta 201: el mensaje con `fileUrl`, `fileName`, `mimeType`, `fileSize`, `author` y `discussion`.
- Errores: 400 `file is required`, MIME real no detectable (salvo `FILE`) o que no coincide con `type`; 403 sin Membership `ACTIVE`; 404 `Discussion not found`.
- Tambien existe `OPTIONS` sobre esta ruta (sin auth, responde 204) para preflight CORS.

### GET /organizations/:organizationId/workspace/discussions/:discussionId/messages
- Auth: Membership ACTIVE (cualquier role)
- Descripcion: Lista mensajes de la discussion en orden cronologico ascendente.
- Query params opcionales:
  - page (default 1, minimo 1)
  - limit (default 50, minimo 1, maximo efectivo 100)
  - type (TEXT | IMAGE | AUDIO | VIDEO | FILE)
- Respuesta 200: `{ "data": [...], "page", "limit", "total", "totalPages" }`
- Errores: 400 paginacion o `type` invalidos; 403 sin Membership `ACTIVE`; 404 `Discussion not found`.

### PATCH /organizations/:organizationId/workspace/discussions/:discussionId/messages/:messageId
- Auth: Membership ACTIVE + ser el autor del mensaje
- Descripcion: Actualiza el contenido de un mensaje solo si el usuario autenticado es el autor.
- Restricciones:
  - Solo permite editar mensajes `TEXT`.
  - No permite reemplazar archivos de mensajes `IMAGE | AUDIO | VIDEO | FILE` desde este endpoint.
- Body:
```json
{
  "content": "Actualizacion del mensaje"
}
```
- Respuesta 200: el mensaje actualizado.
- Errores (en este orden): 403 sin Membership `ACTIVE`; 404 `Discussion not found`; 404 `Discussion message not found` (inexistente, de otra discussion o de otra organization); 403 `You can only modify your own messages`; 400 `Only TEXT messages can be updated` o `content` vacio.

### DELETE /organizations/:organizationId/workspace/discussions/:discussionId/messages/:messageId
- Auth: Membership ACTIVE + ser el autor del mensaje
- Descripcion: Elimina un mensaje solo si el usuario autenticado es el autor.
- Reglas:
  - Si el mensaje es `TEXT`, elimina el registro en base de datos.
  - Si el mensaje tiene `cloudinaryPublicId`, primero intenta eliminar el recurso en Cloudinary usando `resource_type` segun tipo real (`IMAGE -> image`, `VIDEO/AUDIO -> video`, `FILE -> raw`) y luego elimina DB.
  - Si Cloudinary responde `not found`, se considera idempotente y se elimina DB.
  - Si Cloudinary falla (error o respuesta inesperada), no se elimina DB para evitar archivos huerfanos (500).
- Respuesta 200:
```json
{
  "deleted": true,
  "messageId": "UUID"
}
```
- Errores: 403 sin Membership `ACTIVE`; 404 `Discussion not found`; 404 `Discussion message not found`; 403 `You can only modify your own messages`; 500 `Could not delete attachment from Cloudinary`.

## Devices (FCM)

### POST /workspace/devices
- Auth: Usuario autenticado
- Descripcion: Registra o actualiza (idempotente) el dispositivo FCM del usuario autenticado.
- Body:
```json
{
  "token": "fcm_registration_token_android",
  "platform": "ANDROID"
}
```

### DELETE /workspace/devices
- Auth: Usuario autenticado
- Descripcion: Desregistra un token FCM del usuario autenticado.
- Body:
```json
{
  "token": "fcm_registration_token_android"
}
```

## Notifications

### POST /workspace/notifications/test
- Auth: Usuario autenticado
- Descripcion: Envia push de prueba al usuario autenticado (todos sus dispositivos registrados).
- Payload enviado por backend:
```json
{
  "notification": {
    "title": "Workspace",
    "body": "Prueba desde NestJS"
  },
  "data": {
    "type": "TEST"
  }
}
```

## Organizations

### POST /organizations
- Auth: Usuario autenticado
- Descripcion: Crea una organization y, en la misma transaccion, crea Membership del usuario autenticado con role OWNER y status ACTIVE.
- Body:
```json
{
  "name": "Hook Sistemas"
}
```

### GET /organizations/me
- Auth: Usuario autenticado
- Descripcion: Lista solo organizations donde el usuario autenticado tiene Membership ACTIVE.

### GET /organizations/:organizationId
- Auth: Usuario autenticado
- Descripcion: Obtiene informacion basica tenant-safe de una organization donde el usuario autenticado tiene Membership ACTIVE.
- Retorna:
  - id
  - name
  - slug
  - role (rol del usuario autenticado en esa organization)
- Seguridad:
  - Si el usuario no pertenece a la organization o su Membership no esta ACTIVE, retorna 403.

### Miembros de la organization: directorio vs administracion

Son dos conceptos distintos y tienen endpoints distintos.

| Concepto | Endpoint | Quien accede | Que devuelve |
| -------- | -------- | ------------ | ------------ |
| Directorio general | `GET /organizations/:organizationId/members` | cualquier Membership `ACTIVE` (`OWNER`, `ADMIN`, `DEVELOPER`, `MEMBER`) | solo memberships `ACTIVE` |
| Administracion | `GET /organizations/:organizationId/members/manage` | solo `OWNER` o `ADMIN` `ACTIVE` | memberships `ACTIVE` + `SUSPENDED` |

- El **directorio** responde "quien forma parte actualmente de la organization". No es una pantalla administrativa.
- La **administracion** es el listado desde el que se cambian roles y se suspende/reactiva. Es el unico que expone memberships `SUSPENDED`.
- Ninguno de los dos filtra por role: en ambos aparecen `OWNER`, `ADMIN`, `DEVELOPER` y `MEMBER`. La unica diferencia es el `status`.
- Los dos usan el mismo contrato de respuesta (`OrganizationMemberResponse`), igual que las respuestas de cambio de role, suspension, reactivacion y abandono.
- Ninguno de los dos devuelve memberships `LEFT` (abandono voluntario con `POST /organizations/:organizationId/leave`): quien se fue por decision propia no forma parte de la organization ni se administra desde estas pantallas. Un historial de antiguos miembros seria otra vista, fuera de alcance.

### GET /organizations/:organizationId/members
- Auth: Usuario autenticado
- Permisos: cualquier Membership `ACTIVE` de esa organization (`OWNER`, `ADMIN`, `DEVELOPER` o `MEMBER`). El requester con Membership `SUSPENDED` o sin Membership recibe 403.
- Descripcion: Directorio general de miembros de la organization. Devuelve **solamente** memberships `ACTIVE`, de cualquier role, y el resultado es identico para todos los roles del requester.
- **No es un endpoint administrativo**: no expone memberships `SUSPENDED`. Para administrar memberships existe `GET /organizations/:organizationId/members/manage`.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
- No recibe query params: no hay filtros configurables ni paginacion.

#### Que devuelve
| Requester | ACTIVE visibles | SUSPENDED visibles | LEFT visibles |
| --------- | --------------- | ------------------ | ------------- |
| OWNER     | Si              | No                 | No            |
| ADMIN     | Si              | No                 | No            |
| DEVELOPER | Si              | No                 | No            |
| MEMBER    | Si              | No                 | No            |

- El filtro es por `status`, nunca por role: cualquier requester `ACTIVE` ve los memberships `ACTIVE` con role `OWNER`, `ADMIN`, `DEVELOPER` y `MEMBER`.
- Un miembro suspendido **desaparece** de este listado para todos, incluido el `OWNER`. Vuelve a aparecer cuando se lo reactiva.
- Un miembro que abandono la organization (`LEFT`) tambien desaparece. Vuelve a aparecer solo si acepta una nueva invitacion (`LEFT -> ACTIVE`).
- Orden: por `createdAt` ascendente.

#### Proteccion tenant
- La query siempre esta scoped por `organizationId` y se ejecuta despues de validar el Membership `ACTIVE` del requester en esa misma organization.
- Un usuario no puede listar miembros de una organization a la que no pertenece -> 403, sin distinguir si la organization existe.

- Respuesta: array de `OrganizationMemberResponse`. Es una vista explicita, no la entidad TypeORM: no incluye `createdAt`, `updatedAt`, `user.isActive`, `user.roles` ni `password`.
```json
[
  {
    "id": "7f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
    "role": "MEMBER",
    "status": "ACTIVE",
    "joinedAt": "2026-09-06T20:00:00.000Z",
    "user": {
      "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
      "email": "usuario@email.com",
      "fullName": "Usuario Invitado"
    }
  }
]
```
- Errores:
  - 400 `organizationId` no es UUID
  - 401 sin token valido
  - 403 requester sin Membership en la organization o con Membership no `ACTIVE`
- Fuera de alcance de este endpoint: paginacion, filtros configurables por `status` o `role`, busqueda, eliminacion de miembros e historial/auditoria.

### GET /organizations/:organizationId/members/manage
- Auth: Usuario autenticado
- Permisos: solo Membership `ACTIVE` con role `OWNER` o `ADMIN` en esa organization. `DEVELOPER` y `MEMBER` reciben 403. Un `OWNER`/`ADMIN` `SUSPENDED` tambien recibe 403.
- Descripcion: Listado administrativo de memberships de la organization. Devuelve memberships `ACTIVE` **y** `SUSPENDED`, de cualquier role. Es el listado que alimenta la pantalla de administracion de miembros, desde la que se usan `PATCH .../members/:membershipId/role`, `POST .../members/:membershipId/suspend` y `POST .../members/:membershipId/reactivate`.
- Ruta: `manage` es un segmento fijo y no colisiona con las rutas `.../members/:membershipId/...`, que tienen un segmento mas y otro metodo HTTP.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
- No recibe query params: no hay filtros configurables ni paginacion.

#### Que devuelve
| Requester | Accede   | ACTIVE visibles | SUSPENDED visibles | LEFT visibles |
| --------- | -------- | --------------- | ------------------ | ------------- |
| OWNER     | Si       | Si              | Si                 | No            |
| ADMIN     | Si       | Si              | Si                 | No            |
| DEVELOPER | No (403) | -               | -                  | -             |
| MEMBER    | No (403) | -               | -                  | -             |

- No filtra por role: `OWNER` y `ADMIN` ven memberships `OWNER`, `ADMIN`, `DEVELOPER` y `MEMBER`, en cualquiera de los dos status.
- Orden: por `createdAt` ascendente.

#### Visibilidad vs permisos
- Ver un membership en este listado **no** implica poder administrarlo.
- Un `ADMIN` ve al `OWNER` y a otros `ADMIN`, pero no puede cambiarles el role ni el status (403 en `PATCH .../members/:membershipId/role`, `POST .../suspend` y `POST .../reactivate`).
- Un `ADMIN` solo puede administrar memberships `DEVELOPER` y `MEMBER`.
- El membership `OWNER` esta protegido: aparece en el listado, pero no puede degradarse, suspenderse ni reactivarse desde estos endpoints, ni siquiera por el propio `OWNER`. La transferencia de ownership no esta implementada.
- Las reglas administrativas son las documentadas en esos endpoints y no cambiaron.

#### Miembros suspendidos
- Un Membership `SUSPENDED` sigue perteneciendo a la organization: conserva su `id` (`membershipId`), su `role`, su `joinedAt` y su `user`.
- Por eso `OWNER`/`ADMIN` pueden suspender a un miembro, recargar este listado y seguir obteniendo su `membershipId` para reactivarlo, aunque ese miembro ya no aparezca en el directorio general.
- Aparecer aca no otorga acceso tenant: el usuario `SUSPENDED` sigue recibiendo 403 en todos los recursos scoped por esa organization, incluidos el directorio y este mismo endpoint.
- `GET /me/context` no cambio: sigue listando solo organizations donde el usuario tiene Membership `ACTIVE`, por lo que una organization donde esta `SUSPENDED` no aparece.
- Un Membership `LEFT` (abandono voluntario) **no** aparece en este listado: no se reactiva ni se le cambia el role desde la administracion. Vuelve unicamente si acepta una nueva invitacion (`LEFT -> ACTIVE`, ver `POST /organizations/:organizationId/leave`).

#### Proteccion tenant
- Orden de validacion: Membership `ACTIVE` del requester -> permiso `OWNER`/`ADMIN` -> query scoped por `organizationId`.
- Un usuario que no pertenece a la organization recibe 403, sin distinguir si la organization existe.

- Respuesta: array de `OrganizationMemberResponse`, el mismo contrato que el directorio. No expone `createdAt`, `updatedAt`, `user.isActive`, `user.roles` ni `password`.
```json
[
  {
    "id": "6b0c1d2e-3f40-4a51-9b62-7c8d9e0f1a23",
    "role": "OWNER",
    "status": "ACTIVE",
    "joinedAt": "2026-09-01T10:00:00.000Z",
    "user": {
      "id": "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
      "email": "owner@email.com",
      "fullName": "Owner Organization"
    }
  },
  {
    "id": "7f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
    "role": "DEVELOPER",
    "status": "SUSPENDED",
    "joinedAt": "2026-09-06T20:00:00.000Z",
    "user": {
      "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
      "email": "usuario@email.com",
      "fullName": "Usuario Invitado"
    }
  }
]
```
- Errores:
  - 400 `organizationId` no es UUID
  - 401 sin token valido
  - 403 requester sin Membership en la organization, con Membership no `ACTIVE`, o con role `DEVELOPER`/`MEMBER`
- Fuera de alcance de este endpoint: paginacion, filtros configurables por `status` o `role`, busqueda, eliminacion de miembros, transferencia de ownership, salir de la organization (tiene endpoint propio: `POST /organizations/:organizationId/leave`), historial de antiguos miembros (`LEFT`) y auditoria.

### PATCH /organizations/:organizationId/members/:membershipId/role
- Auth: Usuario autenticado
- Permisos: solo Membership `ACTIVE` con role `OWNER` o `ADMIN` en esa organization. `DEVELOPER` y `MEMBER` reciben 403.
- Descripcion: Cambia el role de un miembro existente de la organization. No crea ni elimina memberships, no modifica `status` y no transfiere ownership.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
  - `membershipId` (path, UUID) -> si no es UUID, 400
- Body:
```json
{
  "role": "DEVELOPER"
}
```
- Roles asignables por este endpoint: `ADMIN` | `DEVELOPER` | `MEMBER`. `OWNER` no es asignable -> 400.

#### Reglas OWNER
- puede modificar memberships con role `ADMIN`, `DEVELOPER` o `MEMBER`
- puede asignar `ADMIN`, `DEVELOPER` o `MEMBER`
- no puede asignar `OWNER` -> 400
- no puede modificar el membership `OWNER`, incluido el suyo propio -> 403

#### Reglas ADMIN
- puede modificar memberships con role `DEVELOPER` o `MEMBER`
- puede asignar `DEVELOPER` o `MEMBER`
- no puede modificar el membership `OWNER` -> 403
- no puede modificar otro membership `ADMIN` -> 403 (por la misma regla tampoco puede modificar el suyo, que tambien es ADMIN)
- no puede convertir a nadie en `ADMIN` -> 403
- no puede asignar `OWNER` -> 400

#### OWNER protegido
- El membership cuyo role actual es `OWNER` no puede modificarse desde este endpoint, sin importar quien sea el requester.
- Un OWNER tampoco puede quitarse a si mismo el role `OWNER` aca.
- La transferencia de ownership no esta implementada todavia y sera un flujo aparte.

#### Orden de validacion
1. Body valido (ValidationPipe global: `whitelist` + `forbidNonWhitelisted`): `role` debe ser `ADMIN`, `DEVELOPER` o `MEMBER` -> si no, 400. Esta validacion ocurre antes que cualquier regla de permisos o de tenant.
2. El requester debe tener Membership `ACTIVE` en `organizationId` -> si no, 403.
3. El requester debe ser `OWNER` o `ADMIN` -> si no, 403.
4. El membership objetivo debe existir **dentro de `organizationId`** -> si no, 404.
5. El membership objetivo debe estar `ACTIVE` -> si no, 409.
6. El membership objetivo no puede tener role `OWNER` -> si lo tiene, 403.
7. Reglas OWNER vs ADMIN sobre el role actual del objetivo y el role solicitado -> si no aplican, 403.

#### Role repetido (idempotencia)
- Si el miembro ya tiene el role solicitado, la respuesta es `200` con el objeto sin cambios y **no** se escribe en base.
- Se eligio idempotencia y no 409 porque es un PATCH de atributo, igual que `PATCH /organizations/:organizationId/workspace/modules/:id/active` y equivalentes. El 409 del proyecto se reserva para transiciones de estado invalidas (por ejemplo cancelar una invitacion que no esta `PENDING`) y aqui se usa solo para el membership objetivo no `ACTIVE`.

#### Proteccion tenant / anti-IDOR
- El membership objetivo **nunca** se busca solo por `membershipId`: la consulta siempre incluye `organization_id = :organizationId`.
- Un OWNER de la organization A no puede cambiar roles en la organization B:
  - si usa el `organizationId` de B en el path -> 403 (no tiene Membership ACTIVE en B)
  - si usa el `organizationId` de A con un `membershipId` de B -> 404 (ese membership no existe dentro de A)
- No se filtra existencia entre organizations: el 404 cross-tenant es identico al de un `membershipId` inexistente.

#### Concurrencia
- El UPDATE es condicional sobre el role previo y `status = ACTIVE`. Si otro request cambio el role en el medio, responde 409 y no pisa el cambio.

- Codigo de exito: `200`.
- Respuesta:
```json
{
  "id": "7f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
  "role": "DEVELOPER",
  "status": "ACTIVE",
  "joinedAt": "2026-09-06T20:00:00.000Z",
  "user": {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "usuario@email.com",
    "fullName": "Usuario Invitado"
  }
}
```
- Errores:
  - 400 `role` ausente, con valor invalido, `OWNER`, o body con campos no permitidos
  - 400 `organizationId` o `membershipId` no son UUID
  - 401 sin token valido
  - 403 requester sin Membership en la organization, Membership no `ACTIVE`, role insuficiente, regla OWNER/ADMIN no cumplida, o membership objetivo `OWNER`
  - 404 membership inexistente o perteneciente a otra organization
  - 409 membership objetivo no `ACTIVE` (por ejemplo `SUSPENDED`), o cambio concurrente de role
- Fuera de alcance de este endpoint: transferencia de OWNER, eliminar miembros, salir de la organization (tiene endpoint propio: `POST /organizations/:organizationId/leave`), historial de roles y auditoria. Suspender y reactivar miembros tienen endpoints propios (`POST .../members/:membershipId/suspend` y `.../reactivate`) y no cambian el role.

### POST /organizations/:organizationId/members/:membershipId/suspend
### POST /organizations/:organizationId/members/:membershipId/reactivate
- Auth: Usuario autenticado
- Permisos: solo Membership `ACTIVE` con role `OWNER` o `ADMIN` en esa organization. `DEVELOPER` y `MEMBER` reciben 403.
- Descripcion: Cambia unicamente el `status` de un Membership existente.
  - `suspend`: `ACTIVE` -> `SUSPENDED`
  - `reactivate`: `SUSPENDED` -> `ACTIVE`
- No elimina el Membership, no lo recrea y no modifica `role`, `joinedAt`, `user` ni `organization`. Al reactivar, el miembro vuelve con exactamente el mismo role que tenia antes de la suspension.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
  - `membershipId` (path, UUID) -> si no es UUID, 400
- Body: no llevan body.

#### Reglas OWNER
- puede suspender y reactivar memberships con role `ADMIN`, `DEVELOPER` o `MEMBER`
- no puede suspender ni reactivar el membership `OWNER`, incluido el suyo propio -> 403

#### Reglas ADMIN
- puede suspender y reactivar memberships con role `DEVELOPER` o `MEMBER`
- no puede suspender ni reactivar el membership `OWNER` -> 403
- no puede suspender ni reactivar otro membership `ADMIN` -> 403
- no puede suspender ni reactivar su propio membership -> 403 por la regla explicita de auto-modificacion (ver abajo)

#### Auto-modificacion prohibida
- Regla explicita: **ningun usuario puede suspender ni reactivar su propia Membership**, sin importar su role -> 403.
- Se evalua comparando el `user` del membership objetivo con el usuario autenticado (`targetMembership.user.id === requesterUser.id`), no se deduce de las reglas jerarquicas.
- Se aplica a `suspend` y a `reactivate`.
- Se evalua **antes** que la proteccion del OWNER, que el alcance OWNER/ADMIN y que la transicion de estado: un intento de auto-modificacion siempre responde 403, nunca 409.
  - Ejemplo: un ADMIN `ACTIVE` que intenta reactivar su propio membership recibe 403 (auto-modificacion), no 409 (ya esta `ACTIVE`).
- Un usuario `SUSPENDED` tampoco puede reactivarse a si mismo por otra via: su Membership no es `ACTIVE`, por lo que el requester ya es rechazado con 403.

#### OWNER protegido
- El membership cuyo role actual es `OWNER` no puede suspenderse ni reactivarse desde estos endpoints, sin importar quien sea el requester.
- La regla de auto-modificacion y la de OWNER protegido son independientes: el OWNER no puede auto-suspenderse por las dos razones, y un ADMIN tampoco alcanza a otros ADMIN.

#### Estado del requester
- El requester debe tener Membership `ACTIVE` en esa organization. Un OWNER o ADMIN `SUSPENDED` no puede administrar miembros -> 403.

#### Orden de validacion
1. `organizationId` y `membershipId` deben ser UUID -> si no, 400.
2. El requester debe tener Membership `ACTIVE` en `organizationId` -> si no, 403.
3. El requester debe ser `OWNER` o `ADMIN` -> si no, 403.
4. El membership objetivo debe existir **dentro de `organizationId`** -> si no, 404.
5. El membership objetivo no puede ser el del propio requester -> si lo es, 403.
6. El membership objetivo no puede tener role `OWNER` -> si lo tiene, 403.
7. Reglas OWNER vs ADMIN sobre el role actual del objetivo -> si no aplican, 403.
8. La transicion de estado debe ser valida -> si no, 409.

- Los permisos se evaluan **antes** que el estado: un requester sin alcance sobre el membership objetivo recibe 403 y no descubre si ese membership esta `ACTIVE` o `SUSPENDED`.

#### Transiciones invalidas
- Suspender un membership que ya esta `SUSPENDED` -> 409.
- Reactivar un membership que ya esta `ACTIVE` -> 409.
- Se usa 409 y no idempotencia 200 porque son transiciones de estado, igual que cancelar una invitacion que no esta `PENDING`. La idempotencia 200 del proyecto se reserva para PATCH de atributo, como `PATCH .../members/:membershipId/role`.

#### Efecto de la suspension
- No hay revocacion global del JWT: el token del usuario suspendido sigue siendo valido.
- El acceso tenant se corta igual, porque todo recurso scoped por organization exige Membership `ACTIVE`. Un usuario `SUSPENDED` en esa organization recibe 403 en, por ejemplo:
  - `GET /organizations/:organizationId`
  - `GET /organizations/:organizationId/members`
  - `GET /organizations/:organizationId/members/manage`
  - `GET /organizations/:organizationId/invitations`
  - toda ruta `/organizations/:organizationId/workspace/...` (modules, components, tags, discussions, mensajes, asignaciones y contexto)
- El usuario global no se modifica: sigue accediendo con normalidad a otras organizations donde tenga Membership `ACTIVE`.
- `GET /me/context` deja de listar esa organization mientras el Membership este `SUSPENDED`, porque el contexto ya se construye solo con memberships `ACTIVE` (no requirio cambios). Las invitaciones pendientes del usuario no se ven afectadas.
- El membership suspendido **desaparece del directorio** `GET /organizations/:organizationId/members` para todos los roles, incluido el `OWNER`, porque el directorio solo lista memberships `ACTIVE`.
- El mismo membership **sigue apareciendo** en el listado administrativo `GET /organizations/:organizationId/members/manage`, con `status: "SUSPENDED"` y su `membershipId` intacto, de modo que `OWNER`/`ADMIN` puedan reactivarlo despues de recargar. Al reactivarlo vuelve a aparecer en el directorio.
- Los datos creados por el usuario (discussions, mensajes, asignaciones) no se modifican ni se eliminan.

#### Proteccion tenant / anti-IDOR
- El membership objetivo **nunca** se busca solo por `membershipId`: la consulta siempre incluye `organization_id = :organizationId`.
- Un OWNER de la organization A no puede suspender ni reactivar memberships de la organization B:
  - si usa el `organizationId` de B en el path -> 403 (no tiene Membership ACTIVE en B)
  - si usa el `organizationId` de A con un `membershipId` de B -> 404 (ese membership no existe dentro de A)
- No se filtra existencia entre organizations: el 404 cross-tenant es identico al de un `membershipId` inexistente.

#### Concurrencia
- El UPDATE es condicional sobre el status esperado (`ACTIVE` para suspender, `SUSPENDED` para reactivar) y escribe unicamente la columna `status`.
- Si otro request cambio el status en el medio, responde 409 y no pisa el cambio.

- Codigo de exito: `201` (comportamiento por defecto de Nest para POST en este proyecto, igual que `POST .../invitations/:invitationId/cancel`).
- Respuesta: mismo contrato seguro que `PATCH .../members/:membershipId/role`. No devuelve la entidad `user` completa.
```json
{
  "id": "7f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
  "role": "DEVELOPER",
  "status": "SUSPENDED",
  "joinedAt": "2026-09-06T20:00:00.000Z",
  "user": {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "usuario@email.com",
    "fullName": "Usuario Invitado"
  }
}
```
- Errores:
  - 400 `organizationId` o `membershipId` no son UUID
  - 401 sin token valido
  - 403 requester sin Membership en la organization, Membership del requester no `ACTIVE`, role insuficiente, membership objetivo es el del propio requester, membership objetivo `OWNER`, o regla OWNER/ADMIN no cumplida
  - 404 membership inexistente o perteneciente a otra organization
  - 409 transicion invalida (`ACTIVE -> ACTIVE`, `SUSPENDED -> SUSPENDED`) o cambio concurrente de status
- Fuera de alcance de estos endpoints: eliminar Membership, salir de la organization (tiene endpoint propio: `POST /organizations/:organizationId/leave`, que lleva la Membership a `LEFT`; una Membership `LEFT` no se suspende ni se reactiva desde aca -> 409), transferencia de OWNER, cambio de role, historial/auditoria y notificaciones.

### POST /organizations/:organizationId/leave
- Auth: Usuario autenticado
- Permisos: cualquier Membership `ACTIVE` con role `ADMIN`, `DEVELOPER` o `MEMBER` en esa organization. El `OWNER` no puede abandonar (409, ver abajo).
- Descripcion: Abandono **voluntario** de la organization por el propio usuario autenticado. Cambia unicamente el `status` de su Membership: `ACTIVE` -> `LEFT`.
- No elimina la Membership ni ningun dato: `LEFT` conserva `id` (`membershipId`), `role`, `joinedAt`, `user` y `organization`, y no toca discussions, mensajes, asignaciones, `createdBy`, `author` ni auditoria. La razon de `LEFT` es conservar identidad e historial y permitir un reingreso posterior.
- Actua **siempre** sobre la Membership del usuario del JWT en el `organizationId` del path. No existe forma de abandonar en nombre de otro usuario.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
- Body: no lleva body. No recibe `membershipId`, `userId`, `role` ni `status`.

#### Estados de Membership
| Status      | Significado                                                   | Acceso tenant | Directorio | Administracion | `/me/context` |
| ----------- | ------------------------------------------------------------- | ------------- | ---------- | -------------- | ------------- |
| `ACTIVE`    | pertenece actualmente a la organization                       | Si            | Si         | Si             | Si            |
| `SUSPENDED` | acceso suspendido administrativamente (`POST .../suspend`)    | No (403)      | No         | Si             | No            |
| `LEFT`      | el propio usuario abandono voluntariamente (`POST .../leave`) | No (403)      | No         | No             | No            |

#### Orden de validacion
1. `organizationId` debe ser UUID -> si no, 400.
2. El usuario autenticado debe tener Membership (de cualquier status) en `organizationId` -> si no, 403. Es el mismo 403 que recibe en cualquier recurso tenant y no revela si la organization existe.
3. La Membership debe estar `ACTIVE` -> si esta `SUSPENDED` o `LEFT`, 409 (transicion invalida).
4. El role no puede ser `OWNER` -> si lo es, 409.
5. UPDATE condicional `ACTIVE -> LEFT` -> si otro request cambio el status o el role en el medio, 409.

#### OWNER protegido
- El `OWNER` no puede abandonar la organization mientras siga siendo `OWNER`: responde 409 con el mensaje `OWNER cannot leave the organization: ownership must be transferred first`. Su Membership no se modifica.
- La transferencia de ownership no esta implementada y sera un flujo aparte. Mientras tanto se mantiene un unico `OWNER` por organization, que sigue protegido por las reglas existentes de `suspend`/`reactivate` y de cambio de role (nadie recibe `OWNER` ni lo pierde desde esos endpoints).

#### Transiciones invalidas
- `SUSPENDED -> LEFT`: 409 (`Membership cannot be left because its status is SUSPENDED`). Un usuario suspendido no puede "salir" para esquivar la suspension: el `status` de una Membership suspendida solo lo cambia la administracion (`POST .../reactivate`).
- `LEFT -> LEFT`: 409 (`Membership cannot be left because its status is LEFT`). Abandonar no es idempotente: se usa 409 y no 200, igual que suspender un membership ya suspendido o cancelar una invitacion que no esta `PENDING`.
- En estos dos casos se responde 409 y no 403 porque el usuario **si** tiene una Membership en la organization; lo que falla es la transicion de estado. El 403 se reserva para quien no tiene Membership.

#### Efecto de abandonar
- No hay revocacion global del JWT: el token sigue siendo valido para otras organizations.
- El acceso tenant a esa organization se corta de inmediato, exactamente igual que para alguien que nunca pertenecio, porque todo recurso scoped por organization exige Membership `ACTIVE` (`requireActiveMembership`, sin excepciones para `LEFT`). El usuario `LEFT` recibe 403 en, por ejemplo:
  - `GET /organizations/:organizationId`
  - `GET /organizations/:organizationId/members` y `.../members/manage`
  - `GET /organizations/:organizationId/invitations` y `POST /organizations/:organizationId/invitations`
  - toda ruta `/organizations/:organizationId/workspace/...` (modules, components, tags, discussions, mensajes, asignaciones y contexto)
  - `POST /organizations/:organizationId/leave` responde 409 y no 403, porque la Membership existe (ver arriba).
- `GET /me/context` y `GET /organizations/me` dejan de listar esa organization: ambos se construyen solo con memberships `ACTIVE` (no requirio cambios). La organization abandonada ya no puede seleccionarse como organization activa. Las invitaciones pendientes del usuario no se ven afectadas.
- El membership `LEFT` **desaparece del directorio** `GET .../members` y **tampoco aparece en la administracion** `GET .../members/manage`: a diferencia de `SUSPENDED`, quien se fue por decision propia no se administra (no existe reactivacion administrativa de `LEFT`). Un historial de antiguos miembros seria otra vista, fuera de alcance.
- El usuario `LEFT` deja de ser asignable como developer (`GET .../workspace/developers` y las asignaciones ya exigian Membership `ACTIVE`) y deja de recibir push de esa organization (mismo filtro).
- Los datos creados por el usuario (discussions, mensajes, asignaciones existentes) no se modifican ni se eliminan.

#### Reingreso: nueva invitacion (LEFT -> ACTIVE)
- Un usuario `LEFT` **puede volver a ser invitado** con `POST /organizations/:organizationId/invitations` (OWNER/ADMIN). Un usuario `ACTIVE` o `SUSPENDED` no (409, ver ese endpoint).
- Al aceptar la nueva invitacion (`POST /organization-invitations/:token/accept`) **no se crea una segunda Membership**: se reutiliza la Membership `LEFT` existente (mismo `membershipId`), que pasa a `ACTIVE` con el `role` de la nueva invitacion. El role anterior no se conserva.
  - Ejemplo: `DEVELOPER / LEFT` + nueva invitacion `MEMBER` -> `MEMBER / ACTIVE`.
- `joinedAt` **no se modifica** al reingresar: sigue representando la primera incorporacion a la organization, la misma semantica que preservan `suspend`/`reactivate` y la que ya exponen el directorio y `/me/context`. No existe `leftAt`.
- Ver detalles y concurrencia en `POST /organization-invitations/:token/accept`.

#### Proteccion tenant / anti-IDOR
- La organization sale exclusivamente de `:organizationId` y el usuario afectado exclusivamente del JWT. No hay parametro ni body con el que abandonar la Membership de otro usuario.
- La Membership se busca siempre por `user_id = usuario autenticado` **y** `organization_id = :organizationId`, y el UPDATE se hace sobre ese `id` concreto.
- Un usuario que no pertenece a la organization recibe 403 sin distinguir si la organization existe.

#### Concurrencia
- El UPDATE es condicional sobre `status = ACTIVE` **y** el `role` leido (mismo enfoque que `suspend`/`reactivate` y que el cambio de role), y escribe unicamente la columna `status`.
- Si entre la lectura y el UPDATE otro request suspendio al usuario o le cambio el role, responde 409 (`Membership was modified concurrently, retry the operation`) y no pisa ese cambio. Dos `leave` concurrentes producen un unico `ACTIVE -> LEFT`; el otro recibe 409.

- Codigo de exito: `201` (comportamiento por defecto de Nest para POST en este proyecto, igual que `POST .../members/:membershipId/suspend`).
- Respuesta: mismo contrato `OrganizationMemberResponse` que `suspend`/`reactivate`, ya con `status: "LEFT"`. No devuelve la entidad `user` completa.
```json
{
  "id": "7f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
  "role": "MEMBER",
  "status": "LEFT",
  "joinedAt": "2026-09-06T20:00:00.000Z",
  "user": {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "usuario@email.com",
    "fullName": "Usuario Invitado"
  }
}
```
- Errores:
  - 400 `organizationId` no es UUID
  - 401 sin token valido
  - 403 el usuario autenticado no tiene Membership en la organization
  - 409 Membership `SUSPENDED` o `LEFT` (transicion invalida), role `OWNER`, o cambio concurrente de status/role
- Fuera de alcance de este endpoint: transferencia de OWNER, que el OWNER abandone, eliminacion fisica de Membership, eliminacion de la organization, reactivacion administrativa de `LEFT`, historial/pantalla de antiguos miembros, `leftAt`, notificaciones por email y cambios en el frontend.

### POST /organizations/:organizationId/invitations
- Auth: Usuario autenticado
- Descripcion: Crea una invitacion **interna** dirigida a un usuario registrado de TeamFlow. Solo roles OWNER y ADMIN pueden crear invitaciones.
- Body:
```json
{
  "userId": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
  "role": "MEMBER"
}
```
- Validaciones:
  - el requester debe tener Membership `ACTIVE` en la organization -> si no, 403
  - solo OWNER o ADMIN pueden invitar -> si no, 403
  - `userId` debe ser un UUID valido y existir -> 400 / 404
  - no se puede invitar al propio usuario autenticado -> 400
  - `role` permitido: ADMIN | DEVELOPER | MEMBER. `OWNER` no es invitable -> 400
  - el usuario invitado no puede tener Membership `ACTIVE` en esa organization -> 409 (`User already belongs to this organization`)
  - el usuario invitado no puede tener Membership `SUSPENDED` en esa organization -> 409 (`User has a suspended membership in this organization; reactivate it instead of inviting again`): la reactivacion es administrativa (`POST .../members/:membershipId/reactivate`), no se hace por invitacion
  - el usuario invitado **si** puede tener Membership `LEFT` (abandono voluntario con `POST /organizations/:organizationId/leave`): la invitacion se crea normalmente y, al aceptarla, esa Membership se reutiliza (`LEFT -> ACTIVE`, ver `POST /organization-invitations/:token/accept`)
  - no puede existir otra invitacion `PENDING` vigente para ese usuario en esa organization -> 409
- Notas:
  - `token` se genera de forma criptograficamente segura
  - `expiresAt` se define automaticamente (7 dias)
  - la invitacion queda asociada a `invitedUser`; `email` se completa con el email del usuario invitado solo por historico/compatibilidad
  - por ahora no envia email (la invitacion es interna)
- Respuesta:
```json
{
  "id": "9a0b1c2d-3e4f-4a5b-8c7d-6e5f4a3b2c1d",
  "organizationId": "2b8e1e6c-19a5-4a7c-9f3e-9d1b2a7c4e10",
  "invitedUser": {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "usuario@email.com",
    "fullName": "Usuario Invitado"
  },
  "email": "usuario@email.com",
  "role": "MEMBER",
  "status": "PENDING",
  "token": "d1f0...c9",
  "expiresAt": "2026-09-13T20:00:00.000Z",
  "acceptedAt": null,
  "createdAt": "2026-09-06T20:00:00.000Z"
}
```

### GET /organizations/:organizationId/invitations
- Auth: Usuario autenticado
- Permisos: solo Membership `ACTIVE` con role `OWNER` o `ADMIN` en esa organization. `MEMBER` y `DEVELOPER` reciben 403.
- Descripcion: Vista administrativa de las invitaciones **de la organization** (todas, sin filtrar por estado), para que el frontend pueda mostrar PENDING / ACCEPTED / EXPIRED / CANCELLED.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
- Orden: `createdAt DESC` (mas recientes primero).
- Expiradas:
  - Antes de listar, las invitaciones `PENDING` con `expiresAt <= now` de esa organization se actualizan a `EXPIRED` (misma regla que usa `/organization-invitations/me`).
  - Por lo tanto una invitacion vencida nunca figura como `PENDING`.
- Notas de respuesta:
  - No devuelve `token`: es un endpoint administrativo y el token solo lo necesita el usuario invitado para aceptar.
  - `invitedUser` es `null` solo en invitaciones legacy creadas unicamente con email; en ese caso el campo `email` sigue identificando al destinatario.
- Errores:
  - 401 sin token valido
  - 403 si no hay Membership en la organization, si no esta `ACTIVE`, o si el role no es OWNER/ADMIN
- Respuesta:
```json
[
  {
    "invitationId": "9a0b1c2d-3e4f-4a5b-8c7d-6e5f4a3b2c1d",
    "invitedUser": {
      "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
      "email": "usuario@email.com",
      "fullName": "Usuario Invitado"
    },
    "email": "usuario@email.com",
    "role": "MEMBER",
    "status": "PENDING",
    "expiresAt": "2026-09-13T20:00:00.000Z",
    "acceptedAt": null,
    "createdAt": "2026-09-06T20:00:00.000Z"
  }
]
```

### POST /organizations/:organizationId/invitations/:invitationId/cancel
- Auth: Usuario autenticado
- Permisos: solo Membership `ACTIVE` con role `OWNER` o `ADMIN` en esa organization.
- Descripcion: Cancela una invitacion `PENDING` de esa organization. Cambia `status` a `CANCELLED`.
- Parametros:
  - `organizationId` (path, UUID)
  - `invitationId` (path, UUID)
- Body: no lleva body.
- Validaciones (en este orden):
  1. el requester debe tener Membership `ACTIVE` en `organizationId` -> si no, 403
  2. el requester debe ser OWNER o ADMIN -> si no, 403
  3. la invitacion debe existir **y pertenecer a `organizationId`** -> si no, 404
  4. la invitacion debe estar `PENDING` -> si no, 409
- Efectos:
  - `status` pasa a `CANCELLED`
  - no se elimina fisicamente el registro (queda historico)
  - no se crea ni modifica ningun Membership
  - una invitacion `ACCEPTED`, `EXPIRED` o `CANCELLED` no puede volver a cancelarse -> 409
- Expiradas:
  - Antes de resolver la cancelacion se aplica la misma regla de expiracion que en el listado. Una invitacion `PENDING` vencida pasa a `EXPIRED` y su cancelacion responde 409, no 200.
- Codigo de exito: `201` (comportamiento por defecto de Nest para POST en este proyecto, igual que `/organization-invitations/:token/accept`).
- Respuesta: mismo objeto que el listado, ya con `status: "CANCELLED"`.
```json
{
  "invitationId": "9a0b1c2d-3e4f-4a5b-8c7d-6e5f4a3b2c1d",
  "invitedUser": {
    "id": "4c0d3f5a-4d0d-4b0b-9d2a-8a4d1f0b2c31",
    "email": "usuario@email.com",
    "fullName": "Usuario Invitado"
  },
  "email": "usuario@email.com",
  "role": "MEMBER",
  "status": "CANCELLED",
  "expiresAt": "2026-09-13T20:00:00.000Z",
  "acceptedAt": null,
  "createdAt": "2026-09-06T20:00:00.000Z"
}
```

### Comportamiento tenant / anti-IDOR de invitaciones de organization
Aplica a `GET /organizations/:organizationId/invitations` y a `POST /organizations/:organizationId/invitations/:invitationId/cancel`.

- La invitacion **nunca** se busca solo por `invitationId`: la consulta siempre incluye `organization_id = :organizationId`.
- Un OWNER de la organization A no puede ver ni cancelar invitaciones de la organization B:
  - si usa el `organizationId` de B en el path -> 403 (no tiene Membership ACTIVE en B)
  - si usa el `organizationId` de A con un `invitationId` de B -> 404 (esa invitacion no existe dentro de A)
- No se filtra existencia entre organizations: la respuesta 404 es identica a la de un `invitationId` inexistente.

## Organization Invitations

### GET /organization-invitations/me
- Auth: Usuario autenticado
- Descripcion: Lista las invitaciones pendientes validas dirigidas al usuario autenticado.
- Filtros aplicados por backend:
  - `invitedUser.id = authenticatedUser.id` (fuente de verdad)
  - o, solo por compatibilidad con invitaciones antiguas, `invited_user_id IS NULL AND email = authenticatedUser.email`
  - `status = PENDING`
  - `expiresAt > now`
- Retorna por invitacion:
  - invitationId
  - organizationId
  - organizationName
  - organizationSlug
  - role
  - expiresAt
  - token (sigue siendo necesario para aceptar)
- Nota:
  - Si una invitacion esta `PENDING` pero vencida por fecha, se actualiza a `EXPIRED` y no se retorna.

### POST /organization-invitations/:token/accept
- Auth: Usuario autenticado
- Descripcion: Acepta una invitacion pendiente dirigida al usuario autenticado.
- Validaciones:
  - la invitacion debe existir -> 404
  - `status` debe ser `PENDING` -> 400
  - `expiresAt > now` -> 400
  - si la invitacion tiene `invitedUser`, debe ser el usuario autenticado -> 403
  - si es una invitacion antigua sin `invitedUser`, se valida por `email` y al aceptar se completa `invitedUser` con el usuario autenticado
  - el usuario no debe tener Membership `ACTIVE` ni `SUSPENDED` en esa organization -> 409
- Resultado (en una unica transaccion):
  - sin Membership previa: crea Membership `ACTIVE` con el role de la invitacion (`joinedAt = now`).
  - con Membership `LEFT` (el usuario abandono la organization con `POST /organizations/:organizationId/leave`): **reutiliza esa misma Membership** (mismo `membershipId`), que pasa a `ACTIVE` con el `role` de la nueva invitacion. Nunca se crea una segunda Membership para el mismo par usuario/organization (unique `user + organization`).
  - en ambos casos marca la invitacion como `ACCEPTED` con `acceptedAt`.
- Reingreso desde `LEFT`:
  - el role anterior **no se conserva**: `DEVELOPER / LEFT` + invitacion `MEMBER` -> `MEMBER / ACTIVE`.
  - `joinedAt` no se modifica: sigue siendo la primera incorporacion a la organization. No existe `leftAt`.
  - el UPDATE `LEFT -> ACTIVE` es condicional sobre `status = LEFT` y ocurre en la misma transaccion que marca la invitacion `ACCEPTED`. Si otro request cambio la Membership en el medio (por ejemplo dos aceptaciones concurrentes), responde 409 (`Membership was modified concurrently, retry the operation`) y no queda ningun estado parcial: ni invitacion `ACCEPTED` con Membership `LEFT`, ni Membership `ACTIVE` con invitacion `PENDING`.
  - la respuesta tiene la misma forma que en el alta: la Membership (`id`, `role`, `status`, `joinedAt`, `createdAt`, `updatedAt`) con `user` y `organization` reducidos a `{ "id" }`.
- Contrato del 409:
  - mensaje: `User already belongs to this organization`
  - se produce cuando el usuario tiene Membership `ACTIVE` o `SUSPENDED` en esa organization. Un `SUSPENDED` no reingresa aceptando invitaciones: eso es reactivacion administrativa (`POST .../members/:membershipId/reactivate`).
  - `POST /organizations/:organizationId/invitations` aplica la misma regla al crear (`ACTIVE` y `SUSPENDED` -> 409, `LEFT` permitido), asi que en el flujo normal este 409 solo aparece si el status cambio entre la creacion y la aceptacion.
  - la invitacion queda `PENDING` cuando la aceptacion falla con 409 (no se marca `ACCEPTED`); si corresponde, OWNER/ADMIN puede cancelarla con el endpoint de cancelacion.

### Push automaticas de eventos (Fase 8B)
- No crea endpoints nuevos: se disparan desde endpoints funcionales existentes.
- Regla de destinatarios: usuarios activos (`isActive = true`) con al menos un device en `user_devices`.
- Exclusiones: nunca se envia push al usuario actor que genero el evento.
- Si un usuario activo no tiene devices, no se envia y no genera error.
- Todos los valores del objeto `data` se envian como string.
- Prioridad Android: `high` para visible y silent sync.
- Infraestructura centralizada:
  - `VISIBLE`: incluye `notification { title, body }` + `data`.
  - `DATA_ONLY`: incluye solo `data` (sin `notification`).

Eventos visibles implementados:

1) Discussion creada
- Trigger: `POST /organizations/:organizationId/workspace/discussions`
- Push:
```json
{
  "notification": {
    "title": "Nueva discusión",
    "body": "{fullName} creó: {discussion.title}"
  },
  "data": {
    "type": "DISCUSSION_CREATED",
    "discussionId": "UUID"
  }
}
```
- Nota: crear discussion tambien crea mensaje inicial TEXT, pero se envia solo `DISCUSSION_CREATED` (sin push adicional de mensaje).

2) Mensaje nuevo (TEXT | IMAGE | AUDIO | VIDEO | FILE)
- Triggers:
  - `POST /organizations/:organizationId/workspace/discussions/:discussionId/messages`
  - `POST /organizations/:organizationId/workspace/discussions/:discussionId/messages/files`
- Tipos de notificacion por `messageType`:
  - `TEXT`  -> title `Nuevo mensaje` + body `{fullName} respondió en: {discussion.title}`
  - `IMAGE` -> title `Nueva imagen` + body `{fullName} agregó una imagen en: {discussion.title}`
  - `AUDIO` -> title `Nuevo audio` + body `{fullName} agregó un audio en: {discussion.title}`
  - `VIDEO` -> title `Nuevo video` + body `{fullName} agregó un video en: {discussion.title}`
  - `FILE`  -> title `Nuevo archivo` + body `{fullName} agregó un archivo en: {discussion.title}`
- Payload comun:
```json
{
  "data": {
    "type": "DISCUSSION_MESSAGE",
    "discussionId": "UUID",
    "messageId": "UUID",
    "messageType": "TEXT"
  }
}
```

3) Cambio de estado
- Trigger: `PATCH /organizations/:organizationId/workspace/discussions/:id/status`
- Push:
```json
{
  "notification": {
    "title": "Estado actualizado",
    "body": "{fullName} movió \"{discussion.title}\" a {estadoVisible}"
  },
  "data": {
    "type": "DISCUSSION_STATUS_CHANGED",
    "discussionId": "UUID",
    "status": "IN_PROGRESS"
  }
}
```
- Mapeo visible de estados:
  - `NEW` -> `Entrada`
  - `REVIEW` -> `Revisión`
  - `IN_PROGRESS` -> `Trabajando`
  - `RESOLVED` -> `Resuelto`

4) Cambios de asignacion (asignar, reemplazar, desasignar)
- Triggers:
  - `POST /organizations/:organizationId/workspace/discussions/:id/assignments`
  - `PUT /organizations/:organizationId/workspace/discussions/:id/assignments`
  - `DELETE /organizations/:organizationId/workspace/discussions/:id/assignments/:developerUserId`
- Push:
```json
{
  "notification": {
    "title": "Asignación actualizada",
    "body": "{fullName} actualizó responsables de: {discussion.title}"
  },
  "data": {
    "type": "DISCUSSION_ASSIGNMENT_CHANGED",
    "discussionId": "UUID"
  }
}
```

Eventos silent sync implementados (data-only):

5) Mensaje editado
- Trigger: `PATCH /organizations/:organizationId/workspace/discussions/:discussionId/messages/:messageId`
- Condicion: solo si la edicion fue exitosa.
- Payload:
```json
{
  "data": {
    "type": "DISCUSSION_MESSAGE_UPDATED",
    "discussionId": "UUID",
    "messageId": "UUID"
  }
}
```

6) Mensaje eliminado
- Trigger: `DELETE /organizations/:organizationId/workspace/discussions/:discussionId/messages/:messageId`
- Condicion: se emite solo despues de eliminacion completa (Cloudinary si aplica + DB).
- Payload:
```json
{
  "data": {
    "type": "DISCUSSION_MESSAGE_DELETED",
    "discussionId": "UUID",
    "messageId": "UUID"
  }
}
```

7) Contexto de discussion actualizado (modules/components/tags)
- Triggers:
  - `POST /organizations/:organizationId/workspace/discussions/:id/modules`
  - `DELETE /organizations/:organizationId/workspace/discussions/:id/modules/:moduleId`
  - `POST /organizations/:organizationId/workspace/discussions/:id/components`
  - `DELETE /organizations/:organizationId/workspace/discussions/:id/components/:componentId`
  - `PATCH /organizations/:organizationId/workspace/discussions/:id` (cuando cambia `moduleIds` y/o `componentIds`, o siempre que se envia `tagIds`)
- Condicion: en los endpoints de relacion, solo cuando la relacion se agrega/quita. En el PATCH, cuando el set de modules/components cambia realmente; si se envia `tagIds`, se emite aunque el set de tags no cambie. Los endpoints `POST/DELETE .../discussions/:id/tags` no emiten silent sync.
- Payload:
```json
{
  "data": {
    "type": "DISCUSSION_CONTEXT_CHANGED",
    "discussionId": "UUID"
  }
}
```

Notas operativas:
- El envio push/silent sync no revierte operaciones funcionales (discussion, message, status, assignment o contexto) si Firebase falla.
- Se mantiene la limpieza automatica de tokens invalidos de Fase 8A.
- No se actualiza `lastReadAt` por enviar push; read/unread sigue independiente.

## Tags

Rutas tenant: `/organizations/:organizationId/workspace/tags`. Aplica la misma regla de autorizacion que Modules y Components (ver "Workspace: catalogos tenant"): lectura para cualquier Membership `ACTIVE`, administracion solo para `OWNER` o `ADMIN` `ACTIVE`.

Unicidad: `(organizationId, normalizedName)`. `normalizedName` es el `name` recortado y pasado a minusculas, por lo que dos tags de la misma organization no pueden diferenciarse solo por mayusculas. Dos organizations distintas si pueden tener el mismo tag.

### GET /organizations/:organizationId/workspace/tags
- Auth: Membership ACTIVE
- Descripcion: Lista tags activas de la organization.

### GET /organizations/:organizationId/workspace/tags/all
- Auth: Membership ACTIVE
- Descripcion: Lista tags activas e inactivas de la organization.

### POST /organizations/:organizationId/workspace/tags
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Crea una tag en la organization de la ruta.
- Body:
```json
{
  "name": "Urgente"
}
```
- Errores:
  - 400 `name` vacio, mayor a 100 caracteres, o ya existente en esa organization segun `normalizedName`
  - 403 sin Membership `ACTIVE`, o con role `DEVELOPER` / `MEMBER`

### PATCH /organizations/:organizationId/workspace/tags/:id
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Renombra la tag. Actualiza `name` y `normalizedName`.
- Body:
```json
{
  "name": "Urgencia alta"
}
```
- Errores:
  - 400 `normalizedName` duplicado dentro de la misma organization
  - 403 role insuficiente
  - 404 tag inexistente en esa organization

### PATCH /organizations/:organizationId/workspace/tags/:id/active
- Auth: Membership ACTIVE + OWNER/ADMIN
- Descripcion: Activa o desactiva la tag. No existe DELETE fisico de tag.
- Body:
```json
{
  "active": false
}
```
- Errores: 403 role insuficiente; 404 tag inexistente en esa organization.

## Variables recomendadas para pruebas
- organizationId: UUID de una organization donde el usuario autenticado tiene Membership ACTIVE
- otherOrganizationId: UUID de otra organization, para probar aislamiento tenant
- moduleId: UUID valido de modules de esa organization
- componentId: UUID valido de components de esa organization
- discussionId: UUID valido de discussions de esa organization (se captura en Postman al crear la discussion)
- memberDiscussionId: UUID de una discussion creada por el usuario con role MEMBER (Postman)
- otherComponentId: UUID de un component de otherOrganizationId, para probar aislamiento tenant de relaciones (Postman)
- tagId: UUID valido de tags de esa organization
- messageId: UUID valido de discussion_messages de esa discussion (se captura en Postman al crear el mensaje)
- developerUserId: UUID de un user con Membership ACTIVE asignable en esa organization (role OWNER, ADMIN o DEVELOPER)
- deviceToken: FCM registration token valido de Android

## Read State / Unread

- El estado `status` de la discussion (NEW, REVIEW, IN_PROGRESS, RESOLVED) representa flujo de trabajo global y no se usa para leido/no leido.
- El estado de lectura es por usuario y se guarda en `discussion_read_states` con `lastReadAt`.
- Si no existe read-state para una discussion+usuario, se interpreta como "nunca leida".
- `isUnread` se calcula comparando `lastReadAt` contra la ultima actividad de la discussion.
- Actividad nueva considerada en backend:
  - nuevo mensaje (TEXT, IMAGE, AUDIO, VIDEO, FILE);
  - cualquier actualizacion de la discussion que impacte `updatedAt` (ej: cambios de status, asignaciones, relaciones/contexto, edicion).
