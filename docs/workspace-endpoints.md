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

## Applications

### GET /workspace/applications
- Auth: Usuario autenticado
- Descripcion: Lista solo applications activas.

### GET /workspace/applications/all
- Auth: Developer
- Descripcion: Lista applications activas e inactivas.

### GET /workspace/applications/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene una application activa por id.

### GET /workspace/applications/all/:id
- Auth: Developer
- Descripcion: Obtiene una application por id incluyendo inactivas.

### POST /workspace/applications
- Auth: Developer
- Body:
```json
{
  "name": "Remoto",
  "description": "Aplicacion de asistencia remota"
}
```

### PATCH /workspace/applications/:id
- Auth: Developer
- Body:
```json
{
  "name": "Remoto V2",
  "description": "Descripcion actualizada"
}
```

### PATCH /workspace/applications/:id/active
- Auth: Developer
- Body:
```json
{
  "active": false
}
```

## Indicators

### GET /workspace/indicators
- Auth: Usuario autenticado
- Descripcion: Lista solo indicators activos.

### GET /workspace/indicators/all
- Auth: Developer
- Descripcion: Lista indicators activos e inactivos.

### GET /workspace/indicators/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene un indicator activo por id.

### GET /workspace/indicators/all/:id
- Auth: Developer
- Descripcion: Obtiene un indicator por id incluyendo inactivos.

### POST /workspace/indicators
- Auth: Developer
- Body:
```json
{
  "name": "ST-456",
  "description": "Indicador de prueba"
}
```

### PATCH /workspace/indicators/:id
- Auth: Developer
- Body:
```json
{
  "name": "ST-456-NEW",
  "description": "Descripcion actualizada"
}
```

### PATCH /workspace/indicators/:id/active
- Auth: Developer
- Body:
```json
{
  "active": false
}
```

## Relations Application <-> Indicator

### POST /workspace/applications/:applicationId/indicators/:indicatorId
- Auth: Developer
- Descripcion: Asocia un indicator a una application.

### DELETE /workspace/applications/:applicationId/indicators/:indicatorId
- Auth: Developer
- Descripcion: Elimina asociacion entre application e indicator.

### GET /workspace/applications/:applicationId/indicators
- Auth: Usuario autenticado
- Descripcion: Lista indicators activos asociados a una application.

### GET /workspace/indicators/:indicatorId/applications
- Auth: Usuario autenticado
- Descripcion: Lista applications activas asociadas a un indicator.

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
  "applicationIds": ["{{applicationId}}"],
  "indicatorIds": ["{{indicatorId}}"],
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
  - applicationIds (CSV de UUIDs)
  - indicatorIds (CSV de UUIDs)
  - tagIds (CSV de UUIDs)
  - createdBy (UUID de usuario)
  - mine (true|false)
  - assignedToMe (true|false)
  - assignedDeveloperId (UUID de developer asignado)
  - unread (true|false)

### GET /workspace/discussions/:id
- Auth: Usuario autenticado
- Descripcion: Obtiene una discussion por id con creador, applications, indicators y tags. Incluye `isUnread` para el usuario autenticado.

### POST /workspace/discussions/:id/read
- Auth: Usuario autenticado
- Descripcion: Marca la discussion como leida para el usuario autenticado (idempotente, usa UPSERT por `(discussion_id, user_id)`).

### PATCH /workspace/discussions/:id
- Auth: Usuario autenticado
- Descripcion: Actualiza discussion. `title` y `type` pueden modificarse por el creador o por un developer. `applicationIds` e `indicatorIds` solo pueden modificarse por un developer.
- Reglas de contexto (applications/indicators):
  - Permite reemplazar completamente asociaciones enviando los arrays.
  - Enviar arrays vacios (`[]`) elimina todas las asociaciones de ese catalogo.
  - Si un id no existe, responde error.
  - Si hay ids duplicados, responde error.
- Body:
```json
{
  "type": "IMPROVEMENT",
  "title": "Titulo actualizado",
  "applicationIds": ["{{applicationId}}"],
  "indicatorIds": ["{{indicatorId}}"],
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

### POST /workspace/discussions/:id/applications
- Auth: Developer
- Body:
```json
{
  "applicationId": "{{applicationId}}"
}
```

### DELETE /workspace/discussions/:id/applications/:applicationId
- Auth: Developer

### POST /workspace/discussions/:id/indicators
- Auth: Developer
- Body:
```json
{
  "indicatorId": "{{indicatorId}}"
}
```

### DELETE /workspace/discussions/:id/indicators/:indicatorId
- Auth: Developer

### Nota sobre reemplazo masivo de contexto
- Para reemplazar todas las applications/indicators de una discussion en una sola operacion, usar `PATCH /workspace/discussions/:id` con `applicationIds` y/o `indicatorIds`.

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

### GET /organizations/:organizationId/members
- Auth: Usuario autenticado
- Descripcion: Lista miembros ACTIVE de una organization. Valida que el usuario autenticado pertenezca a esa organization.

### POST /organizations/:organizationId/invitations
- Auth: Usuario autenticado
- Descripcion: Crea invitacion para organization. Solo roles OWNER y ADMIN pueden crear invitaciones.
- Body:
```json
{
  "email": "usuario@email.com",
  "role": "DEVELOPER"
}
```
- Notas:
  - `role` permitido: ADMIN | DEVELOPER | MEMBER
  - `token` se genera de forma criptograficamente segura
  - `expiresAt` se define automaticamente
  - por ahora no envia email

## Organization Invitations

### POST /organization-invitations/:token/accept
- Auth: Usuario autenticado
- Descripcion: Acepta una invitacion pendiente si el email del usuario autenticado coincide con el email de la invitacion y no existe Membership previo en esa organization.
- Resultado: crea Membership ACTIVE con el role de la invitacion y marca invitacion como ACCEPTED con `acceptedAt`.

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

7) Contexto de discussion actualizado (applications/indicators)
- Triggers:
  - `POST /workspace/discussions/:id/applications`
  - `DELETE /workspace/discussions/:id/applications/:applicationId`
  - `POST /workspace/discussions/:id/indicators`
  - `DELETE /workspace/discussions/:id/indicators/:indicatorId`
  - `PATCH /workspace/discussions/:id` (cuando cambia `applicationIds` y/o `indicatorIds`)
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
- applicationId: UUID valido de applications
- indicatorId: UUID valido de indicators
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
