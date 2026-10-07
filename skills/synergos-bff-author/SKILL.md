---
name: synergos-bff-author
description: Construye un orquestador de dominio (Synergos.Bff.*) sobre la máquina de sagas de Synergos.Bff.Core. Cubre lo único que un BFF aporta y ninguna capacidad puede aportar — el ORDEN de los pasos y la COMPENSACIÓN — más las trampas que ya costaron caro: la compensación que cambia de carácter al capturar o consumir, cerrar puertas demasiado pronto, confundir una compensación ARMADA con una PENDIENTE, y leer algo que nadie escribe (un consentimiento que nada otorga, una plantilla que nada aprovisiona). Invocar al arrancar un orquestador nuevo o al tocar el flujo de uno existente (los que hay son los directorios de backend/orquestadores/ del CMS).
---

# SYNERGOS BFF Author — escribir un orquestador de dominio

Un BFF **no** es una capa de reenvío. Es el único sitio donde vive lo que ninguna
capacidad puede saber sola:

- **El ORDEN.** Que el consentimiento va antes del cupo, el cupo antes del cobro,
  y capturar antes de confirmar.
- **La COMPENSACIÓN.** Que si el paso tres falla después de que el dos movió
  plata, hay que devolverla.

Todo lo demás —retroceso, reintentos, rendirse, avisar, idempotencia, barrido—
lo pone `Synergos.Bff.Core` y **no se copia**.

| Referencia | Dónde |
|---|---|
| El modelo de compensación, decisión por decisión | `docs/product/09-compensacion-cruzada.md` |
| Qué se promovió, qué no, y por qué | `docs/product/10-promocion-bff-core.md` |
| Qué capacidades necesita tu dominio | `docs/product/08-despiece-apis.md` §1–2 |
| Dos ejemplos completos y distintos | `Synergos.Bff.Salud/` y `Synergos.Bff.Tienda/` |

Leé **Tienda** si tu flujo tiene un número variable de pasos; **Salud** si es fijo.

---

## 1. La estructura

```
Synergos.Bff.X/
├── Clients/XDtos.cs             las formas MÍNIMAS que consumís de cada capacidad
├── Clients/XCapabilities.cs     : CapabilityClients — un método por llamada
├── Domain/Saga.cs               XSaga : ISaga<XSaga> + las constantes de sus kinds
├── Domain/XCompensationExecutor.cs   qué significa deshacer cada kind
├── Domain/XFlow.cs              EL ORDEN — lo único que no se comparte
├── Contracts/XContracts.cs      lo que sale a la UI
├── Endpoints/XEndpoints.cs      el ruteo
└── Program.cs                   AddSagaMachinery + los servicios propios
```

Referencias: `Synergos.Core`, `Synergos.Shared`, `Synergos.Bff.Core`. **Ninguna
`Synergos.Api.*`** —se habla HTTP— y **ningún otro `Bff.*`**. Los dos los verifica
`BackendSegregationTests`.

### El arranque, entero

```csharp
builder.AddSagaMachinery<XSaga, XCompensationExecutor>(
    new SagaVocabulary("x", "el pedido"),   // minúscula: prefijo de códigos Y raíz de config
    XCapabilities.Cart, XCapabilities.Payments, /* … */);

builder.Services.AddSingleton<XCapabilities>();
builder.Services.AddSingleton<XFlow>();
```

`AddSagaMachinery` agrega **sola** la capacidad de avisos: un orquestador sin
forma de avisar que algo quedó colgado no está terminado, y olvidarla sería un
fallo silencioso.

---

## 2. Las cuatro decisiones que hay que tomar para TU dominio

### 2.1 ¿Dónde parte el flujo en dos fases?

Fase 1 hace lo **reversible y barato**: apartar, cotizar, **autorizar** (reserva
cupo en el medio de pago sin mover plata). Fase 2 hace lo que **cuesta**:
capturar, consumir, despachar.

No es cortesía con la interfaz: es lo que hace que el fallo más común —el usuario
se arrepiente, la ventana se vence, la tarjeta rechaza— **no cueste una
devolución**.

### 2.2 ¿Cuál es el fallo que preferís?

Dentro de la fase 2 el orden decide **qué rotura te queda**, y se elige a
propósito:

| Orden | Si falla el segundo | ¿Se repara solo? |
|---|---|---|
| confirmar → cobrar | servicio entregado que nadie pagó | **no** — hay que perseguir a una persona |
| **cobrar → confirmar** | plata cobrada sin servicio | **sí** — se devuelve |

**Siempre se elige el fallo que el sistema repara sin una persona.**

### 2.3 ¿Qué significa deshacer cada paso — y cambia?

**Esta es la trampa que ya costó caro dos veces.** Una compensación puede volverse
imposible por culpa del paso siguiente:

| Al hacer esto… | …la compensación pasa de | a |
|---|---|---|
| capturar un pago | `VoidPayment` | `RefundPayment` |
| consumir un apartado de stock | `ReleaseStockHold` | `RestockItem` |

Si no se reescribe **en el acto**, la capacidad la rechaza para siempre
(`already_captured`, `hold_already_consumed`) y queda colgada por una razón que no
tiene nada que ver con el mundo real. Y si el paso es un bucle, **reescribí dentro
del bucle**: si falla en la línea tres, las dos primeras ya cambiaron de carácter.

### 2.4 ¿Qué cierra puertas, y va al final?

`fulfill` en Orders y `checkout` en Cart son **irreversibles**: después de
llamarlos, esas capacidades ya no admiten la compensación. La regla que salió de
una corrida real:

> **Lo que cierra una puerta va lo más tarde posible**, cuando ya no queda nada
> detrás que pueda fallar.

Si un paso final falla y todo lo demás salió, **no compenses**: registrá en rojo y
dejá una fila para conciliar. Deshacer un despacho porque una canasta no cerró es
desproporcionado.

---

## 3. Lo que se hereda y NO se reimplementa

Si te encontrás escribiendo cualquiera de estas, parate: ya existe.

- retroceso exponencial y `MaxAttempts`
- rendirse **como estado** (`IsStuck`) y dejar de intentar
- el aviso a una persona, **una sola vez**, con destinatario configurado
- `POST /v1/…/{id}/retry` — la puerta de la persona
- el barrido de fondo
- llaves deterministas: `saga.KeyFor("paso")`
- la traducción HTTP → `Rejection` preservando el código de la capacidad

Lo único tuyo es `ICompensationExecutor<XSaga>` (~40 líneas) y el orden en
`XFlow`. **Si el tercer orquestador te obliga a tocar `Bff.Core`, es la señal de
que la línea quedó mal cortada** — paralo y revisá, no lo parchees.

---

## 4. Las tres guardas que hay que respetar

1. **ARMADA no es PENDIENTE.** Una saga sana en curso lleva sus compensaciones
   anotadas —son el seguro, no la tarea—. `IsUnwinding()` es el filtro. Sin él,
   **toda operación sana se cancela sola** en el primer minuto. (Pasó: seis
   segundos entre `startedAtUtc` y `doneAtUtc`.)
2. **La compensación se anota cuando existe lo que hay que deshacer**, no después.
   Anotarla al final deja una caída en medio con plata reservada y nada que la
   libere.
3. **La saga existe ANTES del primer paso.** Su identificador es la semilla de
   todas las llaves, y la `Idempotency-Key` de la petición **es** ese
   identificador.

---

## 5. Los tests — y lo que de verdad los valida

En `backend/Synergos.Servicios.Tests/Bff/` (la suite del árbol de servicios, que no ve el CMS;
`CLAUDE.md` §0.A.9). El harness está en `CompensationTests` (fijo) y
`PurchaseCompensationTests` (variable): un `HttpMessageHandler` guionado que
permite **matar una capacidad justo entre dos pasos**, que es el instante que un
proceso real no deja elegir.

Probá lo que es **tuyo**, no lo heredado: el orden, los kinds, y que el número de
compensaciones sea el que debe ser. Y después las dos disciplinas que no son
opcionales acá:

1. **Mutá cada decisión**: quitá la reescritura de la compensación, invertí el
   orden de capturar y consumir, sacá la guarda de estado. Confirmá el rojo.
2. **Verificá con procesos reales.** Levantá las capacidades y el BFF, **matá una
   a mitad de flujo** y mirá el estado final en las tres puntas: la saga, la plata
   y el recurso.

> Los tests de Tienda pasaron **16 de 16 a la primera** y el flujo estaba mal. El
> proceso vivo lo destapó en un intento. Un test que pasa no prueba que el código
> esté bien: prueba que coincide con lo que creías.

Arrancar la pila localmente, desde la raíz del repo del CMS (el backend corre en .NET 10 desde la ADR 0140 F2; el CMS sigue en .NET 8), y el entorno pierde `PATH` con `setsid`:

```bash
export PATH="/tmp/claude-0/dotnet:$PATH" DOTNET_ROOT=/tmp/claude-0/dotnet
export NO_PROXY=127.0.0.1,localhost; unset HTTPS_PROXY HTTP_PROXY
setsid env PATH="$PATH" DOTNET_ROOT="$DOTNET_ROOT" \
  ./backend/capacidades/Synergos.Api.X/bin/Debug/net10.0/Synergos.Api.X --urls http://127.0.0.1:5501 \
  --X:Storage:Root=/tmp/x > /tmp/x.log 2>&1 < /dev/null & disown
```

---

## 6. Antes de desplegar

El aviso de compensación colgada necesita **dos cosas que no se inventan**:

1. `X:Alerts:{ToKind,ToId,Address}` — a quién se le avisa. Sin esto no sale nada
   y se grita **una vez** qué falta.
2. La plantilla de `X:Alerts:TemplateKey` autorada en `Api.Notifications` usando
   **solo** `{saga}`, `{origen}`, `{desde}`, `{pendientes}`. Un quinto marcador
   hace que el envío se rechace con `notifications.missing_placeholder`.

No hay seeder que las cree — CLAUDE.md §0.4 los prohíbe, y adivinar una dirección
de guardia es peor que no mandar nada.

> **Y hoy nada la aprovisiona**: `provisionar.sh` siembra definiciones, recursos y precios, no
> plantillas, y `POST /v1/templates` no tiene llamador fuera de los tests. En un servidor limpio el
> aviso sale `notifications.template_not_found`. Los marcadores válidos son los que rellena
> `CompensationAlert` en el código, **no** los del doc 09 §5.2, que documenta unos que el código ya
> no manda (`CLAUDE.md` §11 del CMS, «Lo que NO está»).

### 6.1 ¿Quién escribe lo que tu flujo lee?

Un orquestador que **comprueba** algo antes de actuar depende de que alguien lo **escriba**. La
auditoría encontró dos lecturas sin escritor dormidas detrás de interruptores apagados: `Bff.Salud`
exige el consentimiento `salud.agenda` antes de apartar el cupo y **nada lo otorga** —ni el CMS,
ni `tools/`, ni la UI—, así que con `Synergos:Salud:Mode=Bff` se rechazaría toda cita; y la
plantilla de arriba. Por cada `check`, `GET` o precondición del flujo, buscar su escritor en los
tres árboles (el CMS, la UI y `provisionar.sh`) **antes** de dar el flujo por terminado; si no
hay, es un hueco de cableado del ticket, no un detalle de despliegue.

## 7. Checklist

- [ ] Referencias: Core + Shared + Bff.Core. Ninguna `Api.*`, ningún otro `Bff.*`
- [ ] `AddSagaMachinery` con vocabulario en minúscula y todas sus capacidades
- [ ] Dos fases, con el fallo elegido a propósito y **escrito en el remark**
- [ ] Toda compensación que cambia de carácter, reescrita **en el acto**
- [ ] Lo que cierra puertas, al final
- [ ] Compensaciones anotadas cuando existe lo que deshacen
- [ ] Tests de lo propio + **mutación de cada decisión**
- [ ] **Verificado matando una capacidad a mitad de flujo**
- [ ] Cada precondición que el flujo lee tiene quien la escriba (§6.1)
- [ ] `Synergos.CMS.sln`, `CLAUDE.md` §2 y §11, y un doc de producto si el flujo
      enseñó algo nuevo
