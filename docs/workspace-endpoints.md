# TeamFlow Backend Endpoints

Base URL:
- http://localhost:3000/api/v1

Autenticacion:
- Usuario autenticado: requiere JWT Bearer valido.
- Developer: requiere JWT Bearer con rol developer.

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
  - `organizations`: solo memberships `ACTIVE` con id, name, slug, role, joinedAt
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

## Modules

### GET /workspace/modules
- Auth: Usuario autenticado
- Descripcion: Lista solo modules activas.

### GET /workspace/modules/all
- Auth: Developer
- Descripcion: Lista modules activas e inactivas.

### GET /workspace/modules/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene una module activa por id.

### GET /workspace/modules/all/:id
- Auth: Developer
- Descripcion: Obtiene una module por id incluyendo inactivas.

### POST /workspace/modules
- Auth: Developer
- Body:
```json
{
  "name": "Remoto",
  "description": "Modulo de asistencia remota"
}
```

### PATCH /workspace/modules/:id
- Auth: Developer
- Body:
```json
{
  "name": "Remoto V2",
  "description": "Descripcion actualizada"
}
```

### PATCH /workspace/modules/:id/active
- Auth: Developer
- Body:
```json
{
  "active": false
}
```

## Components

### GET /workspace/components
- Auth: Usuario autenticado
- Descripcion: Lista solo components activos.

### GET /workspace/components/all
- Auth: Developer
- Descripcion: Lista components activos e inactivos.

### GET /workspace/components/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene un component activo por id.

### GET /workspace/components/all/:id
- Auth: Developer
- Descripcion: Obtiene un component por id incluyendo inactivos.

### POST /workspace/components
- Auth: Developer
- Body:
```json
{
  "name": "ST-456",
  "description": "Indicador de prueba"
}
```

### PATCH /workspace/components/:id
- Auth: Developer
- Body:
```json
{
  "name": "ST-456-NEW",
  "description": "Descripcion actualizada"
}
```

### PATCH /workspace/components/:id/active
- Auth: Developer
- Body:
```json
{
  "active": false
}
```

## Relations Module <-> Component

### POST /workspace/modules/:moduleId/components/:componentId
- Auth: Developer
- Descripcion: Asocia un component a una module.

### DELETE /workspace/modules/:moduleId/components/:componentId
- Auth: Developer
- Descripcion: Elimina asociacion entre module e component.

### GET /workspace/modules/:moduleId/components
- Auth: Usuario autenticado
- Descripcion: Lista components activos asociados a una module.

### GET /workspace/components/:componentId/modules
- Auth: Usuario autenticado
- Descripcion: Lista modules activas asociadas a un component.

## Discussions

### POST /workspace/discussions
- Auth: Usuario autenticado
- Descripcion: Crea una discussion con estado inicial NEW y createdBy tomado del token. Requiere initialMessageContent y crea el primer DiscussionMessage de tipo TEXT en la misma transaccion.
- Body:
```json
{
  "type": "ERROR",
  "title": "Problema en la app remota",
  "initialMessageContent": "Descripcion inicial del problema",
  "moduleIds": ["{{moduleId}}"],
  "componentIds": ["{{componentId}}"],
  "tagIds": ["{{tagId}}"]
}
```

### GET /workspace/discussions
- Auth: Usuario autenticado
- Descripcion: Lista discussions paginadas con filtros. Cada item incluye `isUnread` calculado para el usuario autenticado.
- Query params opcionales:
  - page (default 1)
  - limit (default 20)
  - type (ERROR | IDEA | IMPROVEMENT | QUESTION)
  - status (NEW | REVIEW | IN_PROGRESS | RESOLVED)
  - moduleIds (CSV de UUIDs)
  - componentIds (CSV de UUIDs)
  - tagIds (CSV de UUIDs)
  - createdBy (UUID de usuario)
  - mine (true|false)
  - assignedToMe (true|false)
  - assignedDeveloperId (UUID de developer asignado)
  - unread (true|false)

### GET /workspace/discussions/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene una discussion por id con creador, modules, components y tags. Incluye `isUnread` para el usuario autenticado.

### POST /workspace/discussions/:id/read
- Auth: Usuario autenticado
- Descripcion: Marca la discussion como leida para el usuario autenticado (idempotente, usa UPSERT por `(discussion_id, user_id)`).

### PATCH /workspace/discussions/:id
- Auth: Usuario autenticado
- Descripcion: Actualiza discussion. `title` y `type` pueden modificarse por el creador o por un developer. `moduleIds` e `componentIds` solo pueden modificarse por un developer.
- Reglas de contexto (modules/components):
  - Permite reemplazar completamente asociaciones enviando los arrays.
  - Enviar arrays vacios (`[]`) elimina todas las asociaciones de ese catalogo.
  - Si un id no existe, responde error.
  - Si hay ids duplicados, responde error.
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

### PATCH /workspace/discussions/:id/status
- Auth: Developer
- Descripcion: Cambia el estado Kanban de la discussion. No impone flujo lineal de transicion.
- Body:
```json
{
  "status": "IN_PROGRESS"
}
```

### GET /workspace/developers
- Auth: Usuario autenticado
- Descripcion: Lista usuarios activos asignables como developers (id, fullName, email).

### POST /workspace/discussions/:id/assignments
- Auth: Developer
- Descripcion: Agrega developers asignados (sin duplicar).
- Body:
```json
{
  "developerUserIds": ["{{developerUserId}}"]
}
```

### PUT /workspace/discussions/:id/assignments
- Auth: Developer
- Descripcion: Reemplaza completamente la coleccion de developers asignados.
- Body:
```json
{
  "developerUserIds": ["{{developerUserId}}"]
}
```

### DELETE /workspace/discussions/:id/assignments/:developerUserId
- Auth: Developer
- Descripcion: Quita un developer asignado de la discussion.

## Discussion relations (Developer)

### POST /workspace/discussions/:id/modules
- Auth: Developer
- Body:
```json
{
  "moduleId": "{{moduleId}}"
}
```

### DELETE /workspace/discussions/:id/modules/:moduleId
- Auth: Developer

### POST /workspace/discussions/:id/components
- Auth: Developer
- Body:
```json
{
  "componentId": "{{componentId}}"
}
```

### DELETE /workspace/discussions/:id/components/:componentId
- Auth: Developer

### Nota sobre reemplazo masivo de contexto
- Para reemplazar todas las modules/components de una discussion en una sola operacion, usar `PATCH /workspace/discussions/:id` con `moduleIds` y/o `componentIds`.

### POST /workspace/discussions/:id/tags
- Auth: Developer
- Body:
```json
{
  "tagId": "{{tagId}}"
}
```

### DELETE /workspace/discussions/:id/tags/:tagId
- Auth: Developer

## Discussion Messages

### POST /workspace/discussions/:discussionId/messages
- Auth: Usuario autenticado
- Descripcion: Crea un mensaje TEXT dentro de la discussion usando author del token. El autor queda marcado como leido hasta ese momento.
- Body:
```json
{
  "type": "TEXT",
  "content": "Necesitamos revisar este caso en produccion"
}
```

### POST /workspace/discussions/:discussionId/messages/files
- Auth: Usuario autenticado
- Content-Type: multipart/form-data
- Descripcion: Sube un archivo a Cloudinary y crea un DiscussionMessage de tipo IMAGE, AUDIO, VIDEO o FILE. El autor queda marcado como leido hasta ese momento.
- Form-data:
  - type (IMAGE | AUDIO | VIDEO | FILE)
  - file (binary)
  - content (opcional, texto adicional)

### GET /workspace/discussions/:discussionId/messages
- Auth: Usuario autenticado
- Descripcion: Lista mensajes de la discussion en orden cronologico ascendente.
- Query params opcionales:
  - page (default 1)
  - limit (default 50)
  - type (TEXT | IMAGE | AUDIO | VIDEO | FILE)

### PATCH /workspace/discussions/:discussionId/messages/:messageId
- Auth: Usuario autenticado
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

### DELETE /workspace/discussions/:discussionId/messages/:messageId
- Auth: Usuario autenticado
- Descripcion: Elimina un mensaje solo si el usuario autenticado es el autor.
- Reglas:
  - Si el mensaje es `TEXT`, elimina el registro en base de datos.
  - Si el mensaje tiene `cloudinaryPublicId`, primero intenta eliminar el recurso en Cloudinary usando `resource_type` segun tipo real (`IMAGE -> image`, `VIDEO/AUDIO -> video`, `FILE -> raw`) y luego elimina DB.
  - Si Cloudinary responde `not found`, se considera idempotente y se elimina DB.
  - Si Cloudinary falla (error o respuesta inesperada), no se elimina DB para evitar archivos huerfanos.

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
- Los dos usan el mismo contrato de respuesta (`OrganizationMemberResponse`), igual que las respuestas de cambio de role, suspension y reactivacion.

### GET /organizations/:organizationId/members
- Auth: Usuario autenticado
- Permisos: cualquier Membership `ACTIVE` de esa organization (`OWNER`, `ADMIN`, `DEVELOPER` o `MEMBER`). El requester con Membership `SUSPENDED` o sin Membership recibe 403.
- Descripcion: Directorio general de miembros de la organization. Devuelve **solamente** memberships `ACTIVE`, de cualquier role, y el resultado es identico para todos los roles del requester.
- **No es un endpoint administrativo**: no expone memberships `SUSPENDED`. Para administrar memberships existe `GET /organizations/:organizationId/members/manage`.
- Parametros:
  - `organizationId` (path, UUID) -> si no es UUID, 400
- No recibe query params: no hay filtros configurables ni paginacion.

#### Que devuelve
| Requester | ACTIVE visibles | SUSPENDED visibles |
| --------- | --------------- | ------------------ |
| OWNER     | Si              | No                 |
| ADMIN     | Si              | No                 |
| DEVELOPER | Si              | No                 |
| MEMBER    | Si              | No                 |

- El filtro es por `status`, nunca por role: cualquier requester `ACTIVE` ve los memberships `ACTIVE` con role `OWNER`, `ADMIN`, `DEVELOPER` y `MEMBER`.
- Un miembro suspendido **desaparece** de este listado para todos, incluido el `OWNER`. Vuelve a aparecer cuando se lo reactiva.
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
| Requester | Accede   | ACTIVE visibles | SUSPENDED visibles |
| --------- | -------- | --------------- | ------------------ |
| OWNER     | Si       | Si              | Si                 |
| ADMIN     | Si       | Si              | Si                 |
| DEVELOPER | No (403) | -               | -                  |
| MEMBER    | No (403) | -               | -                  |

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
- Fuera de alcance de este endpoint: paginacion, filtros configurables por `status` o `role`, busqueda, eliminacion de miembros, transferencia de ownership, salir de la organization e historial/auditoria.

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
- Se eligio idempotencia y no 409 porque es un PATCH de atributo, igual que `PATCH /workspace/modules/:id/active` y equivalentes. El 409 del proyecto se reserva para transiciones de estado invalidas (por ejemplo cancelar una invitacion que no esta `PENDING`) y aqui se usa solo para el membership objetivo no `ACTIVE`.

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
- Fuera de alcance de este endpoint: transferencia de OWNER, eliminar miembros, salir de la organization, historial de roles y auditoria. Suspender y reactivar miembros tienen endpoints propios (`POST .../members/:membershipId/suspend` y `.../reactivate`) y no cambian el role.

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
- Fuera de alcance de estos endpoints: eliminar Membership, salir de la organization, transferencia de OWNER, cambio de role, historial/auditoria y notificaciones.

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
  - el usuario invitado no puede tener ya Membership `ACTIVE` en esa organization -> 409
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
  - el usuario no debe tener Membership previo en esa organization -> 409
- Resultado: en una transaccion crea Membership `ACTIVE` con el role de la invitacion y marca la invitacion como `ACCEPTED` con `acceptedAt`.
- Contrato del 409 (verificado, sin cambios en esta fase):
  - mensaje: `User already belongs to this organization`
  - la verificacion busca **cualquier** Membership del usuario en esa organization, sin filtrar por `status`; es decir, un Membership no `ACTIVE` tambien produce 409.
  - `POST /organizations/:organizationId/invitations` usa el mismo mensaje pero solo considera Membership `ACTIVE`. La diferencia es intencional por ahora: aceptar no debe crear un segundo Membership para el mismo par usuario/organization.
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
- Trigger: `POST /workspace/discussions`
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
  - `POST /workspace/discussions/:discussionId/messages`
  - `POST /workspace/discussions/:discussionId/messages/files`
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
- Trigger: `PATCH /workspace/discussions/:id/status`
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
  - `POST /workspace/discussions/:id/assignments`
  - `PUT /workspace/discussions/:id/assignments`
  - `DELETE /workspace/discussions/:id/assignments/:developerUserId`
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
- Trigger: `PATCH /workspace/discussions/:discussionId/messages/:messageId`
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
- Trigger: `DELETE /workspace/discussions/:discussionId/messages/:messageId`
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

7) Contexto de discussion actualizado (modules/components)
- Triggers:
  - `POST /workspace/discussions/:id/modules`
  - `DELETE /workspace/discussions/:id/modules/:moduleId`
  - `POST /workspace/discussions/:id/components`
  - `DELETE /workspace/discussions/:id/components/:componentId`
  - `PATCH /workspace/discussions/:id` (cuando cambia `moduleIds` y/o `componentIds`)
- Condicion: solo cuando hay cambio real en contexto.
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

### GET /workspace/tags
- Auth: Usuario autenticado
- Descripcion: Lista tags activas.

### GET /workspace/tags/all
- Auth: Developer
- Descripcion: Lista tags activas e inactivas.

### POST /workspace/tags
- Auth: Developer
- Body:
```json
{
  "name": "Urgente"
}
```

### PATCH /workspace/tags/:id
- Auth: Developer
- Body:
```json
{
  "name": "Urgencia alta"
}
```

### PATCH /workspace/tags/:id/active
- Auth: Developer
- Body:
```json
{
  "active": false
}
```

## Variables recomendadas para pruebas
- moduleId: UUID valido de modules
- componentId: UUID valido de components
- discussionId: UUID valido de discussions
- tagId: UUID valido de tags
- messageId: UUID valido de discussion_messages
- developerUserId: UUID valido de users con rol developer
- deviceToken: FCM registration token valido de Android

## Read State / Unread

- El estado `status` de la discussion (NEW, REVIEW, IN_PROGRESS, RESOLVED) representa flujo de trabajo global y no se usa para leido/no leido.
- El estado de lectura es por usuario y se guarda en `discussion_read_states` con `lastReadAt`.
- Si no existe read-state para una discussion+usuario, se interpreta como "nunca leida".
- `isUnread` se calcula comparando `lastReadAt` contra la ultima actividad de la discussion.
- Actividad nueva considerada en backend:
  - nuevo mensaje (TEXT, IMAGE, AUDIO, VIDEO, FILE);
  - cualquier actualizacion de la discussion que impacte `updatedAt` (ej: cambios de status, asignaciones, relaciones/contexto, edicion).
