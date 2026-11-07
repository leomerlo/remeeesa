# Beta — qué se decidió

Cerrado con Flor el 30–31 Oct 2026. La decisión estructural (mismo repo, dos
entradas, una rama) está en
[ADR 0007](adr/0007-beta-is-the-next-version-two-entries-one-branch.md).

**Para quién es** (corregido el 7 Nov 2026, palabras de Flor: *«no lo va a ver
mi suegro, esto es la actualizacion de la v1 en una v2 para mi»*). La beta es
la **v2 de la app de Flor y Leo**, no una app para afuera. El suegro no la va a
ver. Lo que no cambia es por qué existe: la interfaz de la v1 es la forma
acumulada de un año de arreglos, y la v2 la rediseña. Las reglas de claridad
—tipografía grande, alto contraste, el método de pago diciendo su
consecuencia— son de Flor y siguen valiendo por sí solas; no venían de un
usuario de afuera.

## Decisiones

**Tarjeta vs efectivo.** Se sigue eligiendo el método de pago, pero cada opción
dice en grande qué implica: «sale hoy» o «va al resumen del mes que viene».
Se descartó reducirlo a un solo sí/no («¿ya salió la plata?») por ser menos
fiel a la realidad, aunque de los cuatro métodos solo `credito` cambia el
comportamiento — los otros tres son etiquetas sobre plata que ya salió.

**Home sin presupuesto.** El presupuesto es opcional (ya implementado en la v1,
PR #156: cero significa «sin presupuesto» a través del validador, el alta,
Ajustes y las reglas). Sin presupuesto, la cifra principal es **«llevás $X este
mes»** contra **lo que llevaba a la misma altura del mes pasado**. Sin
presupuesto la única referencia honesta es el propio pasado.

Esa comparación día-a-día **ya está hecha**: `computeSpendToDate` en
`src/lib/expenses/spendToDate.ts` (`monthlyTotals` sigue dando meses enteros,
que es lo que el gráfico de tendencia necesita). Devuelve lo del mes, lo del
mes pasado hasta el mismo día, la diferencia y el porcentaje. Cuenta solo
gastos —una cuenta impaga no se gastó— y deja los dólares afuera, como toda
cifra en pesos. El 31 de marzo corta febrero en el 28, y avisa con qué fecha
cortó para que la pantalla no diga «a esta altura» cuando en realidad es el
mes entero.

**Onboarding.** Cuenta + sus métodos de pago, y nada más. El presupuesto se
ofrece después, no en el camino — ponerlo en el alta lo vuelve obligatorio de
hecho. Los métodos sí van al principio porque sin ellos el selector de método
muestra solo «Efectivo», y ese selector es el centro de la carga.

**Foto de ticket y audio: afuera de esta versión.** Decidido por Flor el 7 de
noviembre de 2026: *«no hay ticket ni audio en esta version, esperaremos»*. La
carga es por teclado, y nada en la app los insinúa — ni un botón apagado ni un
«pronto». La forma sigue acordada para cuando se retome: capturan, llenan el
formulario, la persona confirma y se descartan; nada de Firebase Storage, nada
de Blaze, y una API key de Flor en una Vercel Function (plan gratis). La
investigación está en la memoria `weekend-backlog`, que compara Tesseract.js
on-device contra un modelo de visión (la recomendación fue el modelo).

**Alcance de la primera versión.** Onboarding, carga (por teclado),
Home, movimientos y **cuentas por pagar**. Las cuentas entran aunque sean la
pantalla más compleja de la v1: los servicios son gran parte del mes, y una
v2 sin ellos no reemplaza a la v1.

**Acceso.** Alta solo con código de invitación. La URL es pública pero el
registro no. El motivo original —cuánto se gasta en la API— **ya no corre**:
no hay API (ver foto y audio, arriba) y no entra nadie de afuera. Queda igual
por lo que hace de todos modos: así es como Leo entra al hogar de Flor, y es
la misma puerta que la v1. Sacarlo es un cambio de una línea.

## Lo visual

Se decide **mirando, no escribiendo**: tres direcciones sobre la app real, en
el teléfono, con datos reales. Cada problema visual que Flor encontró en la v1
lo encontró en el celular, no en el escritorio.

Lo que pidió: tipografía **grande** y **alto contraste** en toda la app,
minimalista pero moderna, con personalidad, decisiones reducidas a sí/no. Sin
dinosaurios.

**Nada del sistema visual de la v1 es ley acá** — ni los 46px, ni las cards
planas, ni los cuatro colores, ni el piso de 15px, ni las bandas de los
modales.

**Estado (6 nov 2026): dirección elegida.** Las tres primeras direcciones
(papeles de pago, cuaderno rayado, patrón estándar) se descartaron. Flor trajo
once referencias propias y de ahí salió el sistema que sigue.

### Lo que decían sus referencias

Siete de diez eran verdes, ninguna tenía modo oscuro, en todas la cifra de
plata era lo más grande de la pantalla, y varias ponían **una frase en idioma
humano** debajo del número («You spent more in August»). El estado
seleccionado era siempre una **pastilla de máximo contraste**.

Dos cosas que no se copian: el neumorfismo de las primeras tres (tarjetas casi
blancas sobre fondo casi blanco) es exactamente el «clarito» que Flor prohibió,
y el texto gris secundario de 11px es el «chiquito». Y **ninguna de las once
resuelve lo de tarjeta vs. efectivo** — el problema central del primer usuario
no se copia de ningún lado, hay que inventarlo.

### El sistema

| | |
|---|---|
| Verde | `#3baba9` (turquesa, elegido por Flor). `#19c7bd` para puntos y acentos, `#0f7a76` para texto chico. |
| Semánticos | **Alegres, no apagados.** Rojo `#f4512f`, tintes saturados. Un gris apagado se lee como app vieja. |
| Superficie | **Sombra o borde, nunca los dos**, y siempre sutil. Acá: sombra, cero bordes. |
| Tipografía | Urbanist. Piso de 16px, cifra principal 42–56px. |
| Radio | 22px en tarjetas, 15px en los tiles de ícono. |
| Íconos | Emoji sobre tile de color tenue, uno por categoría. Sin ilustraciones ni mascotas. |

**Responsive de verdad, en tres pasos.** Mobile-first pero tiene que servir en
tablet y en computadora: < 760px barra abajo y una columna; ≥ 760px la barra
pasa a ser un riel a la izquierda y el contenido sigue en una columna; ≥ 1040px
el contenido se parte en dos. Una tablet no puede ser un celular estirado.

**El botón de cargar sobresale** por encima del borde superior de la barra —
lo único que rompe la línea.

### Las palabras

Claras pero **nunca informales**. «Ya salió» está prohibido.

| En vez de | Va |
|---|---|
| Ya salió | **Pagado** |
| Va a la tarjeta | **Con la tarjeta** + «Lo pagás el mes que viene» |

El saludo lleva nombre y una línea de bienvenida debajo. **Sin avatar** — no
va a haber fotos.

### Las dos versiones del Home

Conviven en la misma pantalla, según haya o no presupuesto cargado:

- **Sin presupuesto** — cifra principal «llevás gastado este mes», y debajo la
  comparación contra la misma altura del mes pasado (`computeSpendToDate`).
- **Con presupuesto** — cifra principal **lo que queda**, barra de progreso,
  gastado y presupuesto al pie, y una línea de ritmo: «Quedan 5 días. Podés
  gastar $94.000 por día.» Es el patrón que a Flor le gustó de la referencia
  («You can Spend $76 More Today»).

En las dos versiones, debajo del hero van las dos cifras que **ninguna
referencia tiene**: lo pagado y lo que va a la tarjeta, cada una diciendo su
consecuencia.

Maqueta viva (las dos versiones, con un interruptor):
<https://claude.ai/artifact/SZsi8G6qvrqQ4kXN5RNso7>

## Pendiente de Flor — crear el proyecto de Vercel

El código ya publica; falta la cuenta. En vercel.com → *Add New · Project* →
**el mismo repo** `leomerlo/remeeesa` (Vercel admite varios proyectos sobre
un repo), cambiando tres valores por defecto:

| | |
|---|---|
| Build Command | `npm run build:beta` |
| Output Directory | `dist` |
| Production Branch | `dev` |

Y en *Settings → Environment Variables*, las mismas cuatro del proyecto
actual: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Son idénticas a
propósito — la beta comparte el proyecto de Firebase (ADR 0007).

El nombre del proyecto es la URL.

## Reglas visuales que puso Flor

Sus palabras, que mandan sobre cualquier gusto:

> **Nada chiquito, nada clarito.** Alto contraste, tamaños grandes.
> Simplificación, patrones que se entiendan y claridad. Dentro de toda la
> complejidad de lo que es la herramienta, tenemos que llevarlo al usuario
> de una forma sencilla.

«Nada clarito» se lee literal: los grises lavados y el texto de bajo
contraste están prohibidos, no desaconsejados.

## Qué funcionalidad entra — el límite

Decidido el 6 nov 2026. La beta **no agrega funcionalidad**: redistribuye cómo
se muestra lo que la v1 ya hace. Todo tiene que funcionar contra el backend
que existe hoy.

**Sí entra todo lo que se pueda calcular con los datos que ya tenemos.** La
comparación «a esta altura del mes pasado» (`computeSpendToDate`), el insight
de en qué categoría se va más plata, el arrastre de cuentas recurrentes
(`carryRecurrentes`): son aritmética sobre la base, no funciones nuevas.

**No entra nada que necesite una API de inteligencia artificial.** Lectura de
tickets, transcripción de audio, categorización automática: afuera.

**No entra nada que no exista.** Las notificaciones no existen —no hay FCM ni
messaging en todo `src/`— así que la beta no tiene pantalla de avisos. Una
fila que no lleva a ningún lado es peor que no tener la fila.

**Se arrastran cuentas, no gastos.** Un gasto es esporádico; una cuenta se
repite. `carryRecurrentes` ya hace exactamente eso y está bien así.

## El presupuesto resta lo gastado **y** lo comprometido

El hogar que lleva gastados $829.693 y debe $221.840 en cuentas, con un
presupuesto de $1.200.000, tiene **$148.467**, no $370.307. Es la regla de
`computeRemainingBudget` de la v1: una cuenta que todavía se debe cuenta
contra lo que queda igual que una ya pagada, porque el presupuesto está para
cubrirla.

Por eso la barra tiene dos tramos —lo gastado en violeta, lo comprometido en
ámbar— y las tres tarjetas de abajo cierran: **Pagado + Con la tarjeta =
Gastado**, y **Pendiente** es el tercer término que el número de arriba ya
descontó.

## Mensajes de error (para la versión real)

Pendiente de implementar, pero la regla ya está: cada error dice en castellano
qué pasó y qué hacer, y usa el color que le corresponde —rojo para lo que
falló, ámbar para lo que avisa, verde para lo que salió bien—. Nada de códigos
ni de «algo salió mal».

## Cuentas impagas de un mes pasado — se arrastran

Decidido el 6 nov 2026. Una cuenta que quedó sin pagar **no se queda en su
mes**: aparece en el mes actual, arriba de todo en Cuentas por pagar, **con un
aviso visual fuerte** que dice de qué mes viene («Quedó sin pagar en
septiembre»). Pregunta vieja que la v1 nunca contestó.

## Tarjetas: una sola lista, la del resumen

Lo encontró Flor mirando la pantalla con datos reales: arriba, dentro de
cada tarjeta, había un «Resumen de noviembre» con filas; abajo, una lista
de gastos con la misma forma que los de Gastos. No se entendía en qué
difieren.

Difieren, y mucho:

| | Qué era cada fila | De qué mes |
|---|---|---|
| **El resumen** (arriba, por tarjeta) | **una cuota** — un pedazo de una compra | lo que se cobra el mes que viene, venga de donde venga |
| **La lista** (abajo) | **una compra entera** | lo que se compró en el mes en pantalla |

El problema era que para una compra en **un solo pago las dos cifras son
idénticas**, y esas son la mayoría: «Comida michis $69.287,07» aparecía
dos veces con el mismo número. La diferencia sólo se veía en cuotas —
*Bokita* se compró por $350.000 y en el resumen figura como **cuota 1 de
6, $58.333,33**. No era un problema de datos: la pantalla ponía juntas dos
vistas que coinciden justo en el caso más común.

**Decidido (9 nov 2026): queda el resumen y nada más**, con cada fila
diciendo de qué mes viene la compra —«Cuota 2 de 3 · compra de octubre»—.
Es la lista que contesta la pregunta de la pantalla (cuánto va a pedir la
tarjeta), y el mes de origen era justamente el dato que le faltaba y que
la segunda lista estaba ahí para suplir.

## Abierto

- Maquetar **editar** un gasto, una cuenta y una compra con tarjeta
  (`EditExpenseTarget`, `EditPendienteTarget`, `EditPurchaseTarget` en la v1).
- Maquetar **agregar una cuenta** (`AddPendienteSheet` en la v1).
- Los mensajes de error, cuando se escriba el código real.

Cerrados por lo decidido arriba: el hogar siempre tiene nombre, así que la
pregunta de cómo llamar al de una persona sola no existe; y sin lectura de
tickets ni audio no hace falta ninguna API key.
