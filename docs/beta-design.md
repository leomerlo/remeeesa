# Beta — qué se decidió

Cerrado con Flor el 30–31 Oct 2026. La decisión estructural (mismo repo, dos
entradas, una rama) está en
[ADR 0007](adr/0007-beta-is-the-next-version-two-entries-one-branch.md).

Primer usuario real: **el suegro de Flor**. Quiere seguir sus gastos y le
cuesta distinguir lo de tarjeta de lo de efectivo.

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
presupuesto la única referencia honesta es el propio pasado. Esa comparación
día-a-día **no existe todavía**: `monthlyTotals` da meses enteros.

**Onboarding.** Cuenta + sus métodos de pago, y nada más. El presupuesto se
ofrece después, no en el camino — ponerlo en el alta lo vuelve obligatorio de
hecho. Los métodos sí van al principio porque sin ellos el selector de método
muestra solo «Efectivo», y ese selector es el centro de la carga.

**Foto de ticket y audio: capturan, no se guardan.** Se procesan, llenan el
formulario, la persona confirma, y se descartan. Nada de Firebase Storage, nada
de Blaze. Necesita una API key de Flor en Vercel. Las Vercel Functions están en
el plan gratis — ver la investigación en la memoria `weekend-backlog`, que
también compara Tesseract.js on-device contra un modelo de visión (la
recomendación fue el modelo).

**Alcance de la primera versión.** Onboarding, carga (teclado, voz o foto),
Home, movimientos y **cuentas por pagar**. Las cuentas entran aunque sean la
pantalla más compleja de la v1: para una persona sola, los servicios son gran
parte del mes.

**Acceso.** Alta solo con código de invitación. La URL es pública pero el
registro no: controla quién entra y, sobre todo, cuánto se gasta en la API.
Sacarlo después es un cambio de una línea.

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

## Abierto

- La dirección visual.
- Cómo se llama el «hogar» de alguien que vive solo.
- La función «a esta altura del mes pasado».
- La API key en Vercel (la crea Flor).
- **Si una cuenta impaga de un mes pasado se arrastra al mes actual o se queda
  en el suyo.** Pregunta vieja, nunca contestada; con cuentas por pagar en la
  primera versión, hay que decidirla.
