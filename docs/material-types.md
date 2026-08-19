# Endpoints: material-types

Resumen: gestión de tipos de material usados por `sales_materials`.

Base URL: `/material-types`

---

## GET /material-types
- Descripción: Lista todos los tipos de material.
- Autorización: pública.
- Respuesta 200: arreglo de objetos `MaterialType` con las propiedades:
  - `id` (UUID)
  - `name` (string)
  - `description` (string | null)
  - `createdAt` (ISO datetime)
  - `updatedAt` (ISO datetime)

Ejemplo de esquema de respuesta:

```json
[{
  "id": "uuid",
  "name": "Infografía",
  "description": "Formato corto visual",
  "createdAt": "2026-01-20T12:34:56.000Z",
  "updatedAt": "2026-01-20T12:34:56.000Z"
}]
```

---

## POST /material-types
- Descripción: Crea un nuevo tipo de material.
- Autorización: requiere header `Authorization: Bearer <token>` con rol `admin` o `sales`.
- Body (JSON):
  - `name` (string, máximo 100) — obligatorio
  - `description` (string) — opcional
- Respuestas:
  - `201` — objeto `MaterialType` creado
  - `400` — validación inválida o nombre duplicado
  - `401/403` — token ausente o rol no autorizado

Ejemplo de body:

```json
{
  "name": "Infografía",
  "description": "Formato corto visual"
}
```

---

## PUT /material-types/:id
- Descripción: Actualiza un tipo de material existente.
- Autorización: requiere header `Authorization: Bearer <token>` con rol `admin` o `sales`.
- Path param: `:id` = UUID del `MaterialType`.
- Body (JSON): campos permitidos (parciales): `name`, `description`.
- Respuestas:
  - `200` — objeto `MaterialType` actualizado
  - `400` — validación inválida (p. ej. nombre duplicado)
  - `404` — id no encontrado
  - `401/403` — token ausente o rol no autorizado

Ejemplo de body:

```json
{
  "name": "Infografía Actualizada"
}
```

---

## Notas técnicas
- El frontend debe usar los UUIDs de `material_types` como referencia (`materialTypeId`) al crear/editar `sales_materials`.
- Cuando se muestre la lista de tipos, preferir `GET /material-types` y guardar localmente para selectores.
- Validación de campos: `name` no debe duplicarse (el backend responde `400` si ya existe).
