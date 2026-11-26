# ADR-0006: Estado de tareas y cronómetros solo por RPC; Realtime sin DELETE

- Estado: Aceptado
- Fecha: 2026-11-25
- Decisores: owner del proyecto (vía P-008) y Claude Code

## Contexto

Busy Me registra tiempo en paralelo: varias tareas pueden tener un tramo abierto a la vez,
pero cada tarea solo uno. Las transiciones de estado (`backlog → started → done`) y la apertura
y cierre de tramos deben ser atómicas y consistentes entre web y Android, y el repo es público
con RLS como único control de acceso. P-008 pide que el cliente nunca haga `update` directo de
`tasks.status` ni de `time_entries` abiertos. Además, el `/security-review` del PR de base de
datos encontró que Supabase Realtime (Postgres Changes) no filtra por RLS los eventos DELETE.

## Opciones consideradas

1. **Convención en el cliente** (solo llamar RPC). Pros: simple. Contras: nada lo impone; un
   bug o un cliente alterno rompe los invariantes.
2. **RPC SECURITY DEFINER + revocar update de columnas.** Pros: imposición real. Contras: las
   funciones corren como owner y hay que reimplementar los checks de `auth.uid()` a mano; más
   superficie de error.
3. **RPC SECURITY INVOKER + triggers guard con bandera transaccional** (`set_config('busy_me.via_rpc', '1', true)`
   dentro de la RPC; los triggers rechazan cambios de `status`/`started_at`/`completed_at` y
   la apertura/cierre de tramos si la bandera no está). Pros: la RLS sigue aplicando dentro de
   la RPC; imposición en la base; probado con pgTAP. Contras: depende del supuesto de que el
   cliente no puede fijar GUCs arbitrarios por PostgREST (hoy cierto: solo `request.*`).

Para Realtime: (a) publicar `tasks` y `time_entries` tal cual (DELETE filtra uuids ajenos);
(b) Broadcast desde triggers con canales privados (más piezas); (c) publicar solo
`insert, update` y aceptar que un borrado desde otro dispositivo se ve en el siguiente refetch.

## Decisión

Opción 3 para estado y cronómetros; opción (c) para Realtime. Los helpers internos de las RPC
viven en el esquema `private`, que PostgREST no expone. Las vistas (`v_tasks_board`,
`v_time_allocated`) son `security_invoker` y calculan todo en `America/Mexico_City`.

## Consecuencias

- Positivas: invariantes en la base (un tramo abierto por tarea, `ended_at > started_at`,
  estado solo por RPC); el cliente queda simple; la RLS se prueba con dos usuarios.
- Negativas: editar un tramo en curso exige pausarlo antes; "Cortar a las HH:mm" se hace en dos
  pasos (pausar por RPC y recortar el tramo ya cerrado). Un DELETE hecho en otro dispositivo
  no llega en vivo. Si algún día se expone una RPC genérica o un `pre-request` que haga
  `set_config` con input del cliente, la guarda deja de valer: no hacerlo.
- Reversa: eliminar los triggers guard y la bandera; volver a publicar DELETE solo si Realtime
  lo filtra por RLS en una versión futura.

## Verificación

```bash
supabase test db   # 0005 (guardas y RPC), 0004 (publicación sin DELETE, replica identity default)
grep -rnE "\.update\(\{ *status" --include=*.ts --include=*.tsx --exclude-dir=node_modules . | wc -l   # 0
```
