

# DCGP - Dynamic Context Guidance Paths

**El Sistema Operativo Semántico para Agentes LLM** · v1.0.0-rc · MIT

[![Spec](https://img.shields.io/badge/spec-DCGP--1.0-0f6e56)](./DCGP-SPEC.md)
[![Conformance](https://img.shields.io/badge/conformance-FULL%2BEXTENDED-0f6e56)](./COMPLIANCE)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Zero deps](https://img.shields.io/badge/@dcgp/core-0%20runtime%20deps-success)](./packages/core/package.json)

DCGP es una capa de gobernanza de ciclo cerrado que elimina la degradación del contexto y las alucinaciones en sesiones de LLM de larga duración. Monitorea la salud del contexto por turno y orquesta intervenciones, prediciendo la degradación antes de que el modelo comience a alucinar.

DCGP también incluye **`@dcgp/vibe-audit`** para el análisis estático de repositorios codificados por IA ("vibe-coded"): 8 reglas que detectan los artefactos que suele dejar atrás el código asistido por IA (marcadores de stubs, credenciales codificadas, evasión de seguridad de tipos, inyección de comandos, teatro de pruebas, aleatoriedad predecible, riesgo de ReDoS, desequilibrio en la densidad de comentarios). Gobernanza en tiempo de ejecución mediante el bucle de 7 pasos; gobernanza estática mediante `dcgp audit`. Mismo sistema de niveles de severidad, misma estructura `Finding`, mismos formateadores JSON / SARIF / Markdown.

**El estado actual de este repositorio está definido por `./scripts/verify-dcgp.sh`.** Es la única fuente de verdad sobre lo que está implementado. El texto a continuación describe la intención; el script ejecuta la realidad.

> **Relación con DCP ([@tarquinen/opencode-dcp](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)):** DCP gestiona la *cantidad* de contexto (presupuesto de tokens, poda basada en reglas de obsoletos). DCGP gestiona la *calidad* del contexto (anclaje de dominio, predicción de entropía, bloqueo de alucinaciones). Ejecute ambos, son ortogonales y aditivos.
>
> DCGP no reImplementa la poda de DCP. DCGP emite una `RetentionDirective` en cada transición de nivel de entropía (ver [Pruning Nexus](#the-pruning-nexus)); `@dcgp/opencode` traduce cada directiva a un parche de configuración con forma de DCP (`turnProtection`, `compress`, `strategies`) para que la poda de DCP se ajuste a medida que la entropía aumenta. La tabla de traducción es `CONFIG_TRANSLATION` en `@dcgp/opencode`.
>
> Los archivos de configuración coexisten en `.opencode/`:
>
> ```
> .opencode/dcp.jsonc    <- DCP reads this (rule-based pruning config)
> .opencode/dcgp.jsonc   <- DCGP reads this (domain signals, gates, anchors)
> ```

---

## Inicio rápido (bifurca o clona en tu repositorio)

Tres formas de adoptar DCGP, ordenadas de la más rápida a la más integrada:

### 1. Instalación en una línea en un proyecto existente

```bash
DCGP_VERSION=v1.0.0-rc curl -fsSL https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}/scripts/install.sh | bash
```

Esto coloca los dos archivos canónicos de gobernanza (`AGENTS.md` + `CLAUDE.md`) en tu repositorio, genera `.dcgp/<your-project>.dcgp.json` (o `.opencode/dcgp.jsonc`) y opcionalmente instala `@dcgp/core` si tienes un `package.json`. Cada herramienta de IA que lea `AGENTS.md` (Claude Code, Cursor, Zed, OpenAI Codex CLI, y más en crecimiento) ahora opera dentro del bucle de 7 pasos.

**Si tu herramienta necesita su propio nombre de archivo** (Cursor legado, Cline, Windsurf, Aider, Continue, Copilot), agrega un alias de una línea después de la instalación:

```bash
cp AGENTS.md .cursorrules       # Cursor (legacy)
cp AGENTS.md .clinerules        # Cline
cp AGENTS.md .windsurfrules     # Windsurf
cp AGENTS.md .github/copilot-instructions.md   # Copilot (mkdir first)
```

Ruta de integración moderna: usa `@dcgp/mcp` — el servidor expone DCGP como herramientas + recursos que cualquier cliente compatible con MCP consume nativamente. Ver [Integración MCP](#mcp-integration-claude-desktop-openwebui-cline-cursor-zed) a continuación.

**Fija `DCGP_VERSION` a una etiqueta en producción.** Las instalaciones sin fijación derivan silenciosamente si los archivos de gobernanza aguas arriba cambian.

### 2. Integración como biblioteca

```bash
pnpm add @dcgp/core @dcgp/paths          # governance kernel + 16 community paths
pnpm add @dcgp/opencode                  # only if you use OpenCode
pnpm add -g @dcgp/cli                    # optional CLI (dcgp classify, dcgp status, ...)
```

Usa el entorno de ejecución directamente:

```ts
import { DCGPRuntime } from "@dcgp/opencode";

const dcgp = new DCGPRuntime({ workspacePath: process.cwd() });
dcgp.classify(0);

// Per-turn:
const result = dcgp.processTurn({
  turn: 1,
  userMessage: "how do I set this up?",
  assistantMessage: modelOutput,
});

// result.directive is the RetentionDirective (Pruning Nexus).
// result.injection is the XML block to prepend to the next system prompt.
// result.gateViolations, result.driftEvents are the Sentinel-1 hit list.
```

### 3. Bifurcar y extender

```bash
git clone https://github.com/addicted2crypto/DCGP.git
cd dcgp
pnpm install
pnpm -r build
pnpm test
./scripts/verify-dcgp.sh            # 62+ checks pass at FULL+EXTENDED
```

Luego:
- **Agrega una nueva ruta comunitaria** en `packages/paths/src/<category>/<name>.ts` y reexporta desde `packages/paths/src/index.ts`. Los invariantes de `community-paths.test.ts` fallan de forma segura si omites un campo obligatorio.
- **Extiende el corpus de puertas** en `gates: [...]` de cada ruta o contribuye con patrones neutrales de dominio a `packages/core/src/gates/HallucinationGate.ts`.
- **Agrega un nuevo punto de montaje de editor** replicando `CLAUDE.md` en la ubicación de configuración de ese editor. `scripts/install.sh` es la lista canónica de instalación.

Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para el flujo de trabajo completo de bifurcación, incluido cómo proponer un nuevo nivel de cumplimiento o agregar una constante de Modo de Fallo.

---

## Cumplimiento

Este repositorio declara:

```
DCGP-1.0-FULL + EXTENDED
```

Verifica desde un clon en frío:

```bash
pnpm install
pnpm --filter @dcgp/core test
./scripts/verify-dcgp.sh       # exits 0 with "DCGP-1.0 FULL+EXTENDED verified"
```

### Resumen de niveles

| Nivel | Ámbito | Estado |
|---|---|---|
| **MIN** | Esquema + cascada + inyección (§ 3, 4, 5, 6) | Fase A |
| **FULL** | MIN + EntropyMonitor + Pruning Nexus + Modos de Fallo (§ 7, 7.7, 10b) | Fase A |
| **EXTENDED** | FULL + FineTuningExporter (§ 9) | Fase A |

---

## El Pruning Nexus

El punto de poda del contexto. `EntropyMonitor` no realiza la poda: emite una `RetentionDirective` que vincula la política de retención a la salud del contexto. Cualquier consumidor (el `RetentionScorer` interno, el plugin DCP externo) aplica:

```
Keep(block) := score(block) ≥ directive.globalFloor
            ∨  matches(block.path, directive.protectedPaths)
```

El mapeo determinista desde el nivel de entropía hasta el umbral de retención. Mayor umbral = poda más estricta (los bloques deben obtener puntuación >= umbral para sobrevivir):

```
NOMINAL   -> PASSIVE    · floor = 0.20   Keep most blocks
ELEVATED  -> TIGHTEN    · floor = 0.40   Raise the bar; mid-value content drops
HIGH      -> AGGRESSIVE · floor = 0.65   Only hot anchors and recent tools
CRITICAL  -> NUCLEAR    · floor = 0.90   Anchors alone survive (anchors score 1.0)
```

Especificación normativa completa en [`DCGP-SPEC.md § 7.7`](./DCGP-SPEC.md).

---

## El Bucle de Inteligencia Circular de 7 Pasos

Cada turno sigue esta secuencia, sin excepciones.

```
Sense -> Classify -> Predict -> Orchestrate -> Execute -> Verify -> Refine -> (repeat)
```

| Paso | Componente | Responsabilidad |
|---|---|---|
| 1 · Percibir | `FingerprintEngine` | Escaneo del espacio de trabajo: paquetes, entorno, git. Caché TTL de 30s. |
| 2 · Clasificar | `DomainClassifier` | Coincidencia de señales ponderadas -> confianza 0.0-1.0. |
| 3 · Predecir | `EntropyMonitor` | Puntuación de salud por turno -> emisión graduada de `RetentionDirective`. |
| 4 · Orquestar | `ContextInjector` | Anclas XML inyectadas mediante cascada de 5 niveles. Mitigación de hinchazón de anclas. |
| 5 · Ejecutar | LLM | El modelo realiza la tarea en la ventana de contexto moldeada. |
| 6 · Verificar | `HallucinationGate` + `DomainDriftDetector` | Salida validada. Detección de desviación. |
| 7 · Refinar | `RetentionScorer` + `SessionState` | Retención dirigida por directivas. Salud de la sesión persistida. |

---

## El EntropyMonitor: Núcleo Matemático

```
score = gate_pressure       × 0.30
      + drift_pressure      × 0.25
      + confidence_decay    × 0.20
      + citation_pressure   × 0.20
      + session_age         × 0.05
```

| Factor | Fórmula | Satura en |
|---|---|---|
| `gate_pressure` | `min(1, violations_in_window / (windowSize × 3))` | 3 violaciones/turno |
| `drift_pressure` | `min(1, drift_events_in_window / (windowSize × 2))` | 2 eventos/turno |
| `confidence_decay` | `max(0, (peak − current) / peak)` | Caída total desde el pico |
| `citation_pressure` | `min(1, uncited_turns_in_window / windowSize)` | Cada turno sin ancla |
| `session_age` | `min(1, ln(turn+1) / ln(51))` | Turno 50 |

**¿Por qué `citation_pressure`?** Cierra el punto ciego de la *alucinación silenciosa*: una salida sintácticamente limpia pero factualmente incorrecta que no coincide con ninguna puerta ni patrón de desviación. Si el asistente produce contenido que nunca coincide por subcadena con ninguna ancla activa, la presión aumenta. No es un detector perfecto, pero es una señal donde antes no había ninguna.

**Restricciones aplicadas en el constructor:**
- Los pesos deben sumar 1.0 ± 0.001 Y cada peso ∈ [0, 1]: lanza `Error` si se incumple alguna condición
- La puntuación siempre está limitada a [0.0, 1.0]
- La sumación usa el algoritmo compensado de Kahan: sin deriva de punto flotante en más de 200 turnos
- La confianza desconocida (`-1`) aplica `CONFIDENCE_UNKNOWN_PENALTY = 0.15` si **≥50%** de las lecturas son así: sin puntos ciegos
- El contador `turn` es monótono: lanza error en caso de regresión

**Respuesta graduada (rangos inclusivos por la izquierda, exclusivos por la derecha):**

| Nivel | Puntuación | Directiva emitida | Acciones |
|---|---|---|---|
| NOMINAL | `[0.00, 0.40)` | `PASSIVE` (floor=0.20) | Monitoreo pasivo |
| ELEVATED | `[0.40, 0.70)` | `TIGHTEN` (floor=0.40) | Reinyectar anclas (limitado por enfriamiento) |
| HIGH | `[0.70, 0.90)` | `AGGRESSIVE` (floor=0.65) | Reinyectar · sugerir compresión · `<dcgp-entropy-correction>` |
| CRITICAL | `[0.90, 1.00]` | `NUCORIAL` (floor=0.90) | Forzar reclasificación · `fingerprinter.invalidate()` · corrección completa |

**Mecánicas de estabilidad:**
- Histéresis: 2 turnos consecutivos por encima del umbral antes de activarse (CRÍTICO: 1 turno)
- Tiempos de enfriamiento: ELEVADO 5t · ALTO 3t · CRÍTICO 1t
- Enfriamiento de reinyección de anclas: `ANCHOR_REINJECT_COOLDOWN_TURNS = 3`: evita bucles de desperdicio de tokens
- TTL del clasificador: `CLASSIFIER_TTL_TURNS = 20`: la invalidación+reclasificación forzada cierra el punto ciego del clasificador obsoleto
- `resetPartial()` en cambio de dominio: limpia confianza + citas + pico, conserva ventanas de puerta/desviación (previene Shock de Contexto)
- `reset()` en CRÍTICO o reinicio de sesión: borra todo el estado

---

## Modos de Fallo (aplicados)

Cada modo a continuación tiene una constante con nombre exportada y una prueba Sentinel que pasa:

| # | Modo de fallo | Constante | Prueba |
|---|---|---|---|
| 1 | Colisión de señal | `COLLISION_DELTA = 0.10` | `classifier.collision.test.ts` |
| 2 | Hinchazón de ancla | `ANCHOR_BLOAT_RATIO = 0.20`, `ANCHOR_DEMOTION_PRIORITY = 70` | `injector.bloat.test.ts` |
| 3 | Punto ciego de calentamiento | `WARMUP_TURNS = 3` | `gate.warmup.test.ts` |
| 4 | Bloqueo de dominio | `SHIFT_COOLDOWN_TURNS = 3` | `classifier.deadlock.test.ts` |
| 5 | Deriva numérica | `kahanSum` | `entropy.kahan.test.ts` |
| 6 | Clasificador obsoleto | `CLASSIFIER_TTL_TURNS = 20` | `classifier.ttl.test.ts` |
| 7 | Bucle de reinyección de ancla | `ANCHOR_REINJECT_COOLDOWN_TURNS = 3` | `injector.reinject.test.ts` |

Los vectores de fuga residual conocidos están documentados en [`DCGP-SPEC.md § 10c`](./DCGP-SPEC.md): deriva de paradigma semántico, contenido de ancla obsoleto, falsos positivos de cercas de código markdown y memoria entre sesiones. Estos están fuera del alcance de DCGP-1.0 y se exponen explícitamente en lugar de esconderse tras "todos los huecos de la especificación cerrados".

---

## FineTuningExporter: gobernanza en tiempo de ejecución como datos de entrenamiento

Cada corrección que inyecta DCGP es un ejemplo de entrenamiento etiquetado. Violación de puerta -> salida corregida es un par `(prompt, completion)`. Evento de desviación -> corrección anclada al dominio es otro. El `FineTuningExporter` recorre el registro de eventos de una sesión y emite JSONL en formatos OpenAI, Anthropic o HuggingFace SFT.

```ts
import { FineTuningExporter } from '@dcgp/core'

const exporter = new FineTuningExporter()
exporter.activate(activePath)
const examples = exporter.buildExamples(sessionState.eventLog)
const jsonl = exporter.serialize(examples, 'openai')
```

Tu gobernanza en tiempo de ejecución se convierte en tus datos de entrenamiento. Consulta [`DCGP-SPEC.md § 9`](./DCGP-SPEC.md) para el esquema normativo.

---

## Inicio rápido: ruta del proyecto

Crea `.dcgp/<your-project-id>.dcgp.json`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/addicted2crypto/DCGP/main/dcgp.schema.json",
  "id": "my-project",
  "version": "1.0.0",
  "name": "My Project",
  "extends": "nodejs",
  "signals": {
    "packages": ["@my/core"],
    "files": ["my.config.ts"],
    "keywords": ["my-project"],
    "gitBranch": ["feat/*"]
  },
  "anchors": [
    {
      "id": "stack",
      "label": "Stack identity",
      "priority": 100,
      "content": "Factual description of your stack, versions, and constraints."
    }
  ],
  "gates": [
    {
      "id": "no-console",
      "pattern": "console\\.log",
      "severity": "warn",
      "message": "Use project logger, not console.log",
      "context": "output"
    }
  ],
  "driftRules": [
    {
      "sourceDomain": "python",
      "pattern": "pip install|requirements\\.txt",
      "severity": "error",
      "correction": "Node.js project. Use npm/pnpm."
    }
  ],
  "compression": {
    "summarizeAs": "my-project development session",
    "neverPrune": ["src/core/**"],
    "retention": [{ "pattern": "read:src/**", "score": 0.8 }]
  }
}
```

---

## Instalación

```bash
pnpm add @dcgp/core
```

Incorporación al repositorio en una línea (coloca archivos de montaje universales para herramientas de IA + `.dcgp/` generado):

```bash
DCGP_VERSION=v1.0.0-rc curl -fsSL https://raw.githubusercontent.com/addicted2crypto/DCGP/${DCGP_VERSION}/scripts/install.sh | bash
```

Se recomienda encarecidamente fijar `DCGP_VERSION` a una etiqueta en producción: las instalaciones sin fijación derivan silenciosamente si los archivos de gobernanza aguas arriba cambian.

---

## Integración MCP (Claude Desktop, OpenWebUI, Cline, Cursor, Zed)

`@dcgp/mcp` es un servidor de Protocolo de Contexto de Modelo (Model Context Protocol) que expone DCGP como herramientas + recursos. Cualquier cliente compatible con MCP puede consumirlo. El servidor se ejecuta localmente en stdio: sin API alojada, ningún dato sale del equipo.

Instalar globalmente:

```bash
pnpm add -g @dcgp/mcp
```

Luego conéctalo a tu cliente:

### Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "dcgp": {
      "command": "npx",
      "args": ["-y", "@dcgp/mcp"],
      "env": {
        "DCGP_WORKSPACE": "/absolute/path/to/your/project"
      }
    }
  }
}
```

Reinicia Claude Desktop. Las herramientas de DCGP aparecen en la lista de herramientas; los recursos se muestran bajo el ícono de adjuntar.

### Cline (extensión de VS Code)

En la configuración MCP de Cline (`~/.config/cline/mcp.json` o la interfaz de la extensión), agrega:

```jsonc
{
  "mcpServers": {
    "dcgp": {
      "command": "dcgp-mcp",
      "args": ["--workspace", "${workspaceFolder}"]
    }
  }
}
```

### Cursor

Cursor soporta MCP mediante `.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "dcgp": {
      "command": "dcgp-mcp",
      "args": ["--workspace", "${workspaceFolder}"]
    }
  }
}
```

### OpenWebUI

OpenWebUI expone MCP a través de su interfaz de pipeline/herramientas. Instala el plugin de pipeline MCP, luego registra:

```yaml
mcp_servers:
  dcgp:
    command: dcgp-mcp
    args: ["--workspace", "/path/to/repo"]
```

### Zed

`settings.json` de Zed:

```jsonc
{
  "experimental.mcp": {
    "servers": {
      "dcgp": {
        "command": "dcgp-mcp",
        "args": ["--workspace", "${workspace_root}"]
      }
    }
  }
}
```

### Herramientas expuestas

```
dcgp_classify           classify the workspace
dcgp_status             current entropy + directive + stats
dcgp_process_turn       run one turn through the loop (gates, drift, monitor)
dcgp_gate_text          scan arbitrary text for gate violations
dcgp_paths              list all 16 community domains
dcgp_get_directive      read the current RetentionDirective
dcgp_inject_anchors     render the XML system-prompt injection block
dcgp_reset              reset monitor state (partial or full)
```

### Recursos expuestos

```
dcgp://session-state    current DCGPSessionState (JSON)
dcgp://active-path      active ContextPath (JSON)
dcgp://anchors          rendered XML injection block
dcgp://hardrules        HARDRULES.md contents
dcgp://agents           AGENTS.md contents
dcgp://spec             DCGP-SPEC.md contents
dcgp://compliance       declared conformance tier
```

---

## Restricciones de ingeniería: reglas absolutas

**Nunca hagas esto:**

```
NO threading primitives    - single-threaded Node.js, race conditions impossible
NO probability logic       - entropy score is a Health Index, not a probability
NO hard reset on shift     - use resetPartial(), not reset(), on domain shifts
NO standard + summation    - use kahanSum() for all cumulative score tracking
NO any types in core       - strict explicit types only
NO external deps in core   - @dcgp/core has zero runtime dependencies
```

**Siempre haz esto:**

```
DO run both DCGP + DCP     - they are complementary, not competing
DO use definePath()        - it validates against Zod at module load
DO write deterministic tests - no mocks on EntropyMonitor
```

---

## Línea base de verificación (§ 7.6)

Una implementación DCGP-1.0-FULL es saludable cuando se cumplen las cinco condiciones:

1. **Determinismo** - las secuencias de entrada idénticas producen puntuaciones de entropía idénticas
2. **Monotonía** - las puntuaciones ascienden por ELEVADO antes de alcanzar ALTO
3. **Histéresis** - los picos de un solo turno no activan eventos (excepto CRÍTICO)
4. **Estabilidad** - la puntuación se mantiene en [0,1] después de más de 200 turnos con entrada mixta
5. **Reinicio parcial** - `resetPartial()` limpia la confianza pero conserva las ventanas de puerta/desviación

Cada una está cubierta por una prueba Sentinel con nombre y es afirmada por `scripts/verify-dcgp.sh`.

---

## Estructura de paquetes (actual, no aspiracional)

```
packages/
  core/                    @dcgp/core - zero runtime deps - Phase A FULL+EXTENDED
    src/
      types/               ContextPath, Entropy, Directive, Session
      schema/              validate.ts (Zod + definePath)
      classifier/          FingerprintEngine.ts · DomainClassifier.ts
      loader/              CascadeResolver.ts
      gates/               HallucinationGate.ts · DomainDriftDetector.ts
      pruner/              RetentionScorer.ts (Pruning Nexus enforcer)
      injector/            ContextInjector.ts (with bloat mitigation)
      monitor/             EntropyMonitor.ts (Directive emitter)
      state/               SessionState.ts
      export/              FineTuningExporter.ts (EXTENDED tier)
      utils/               clamp.ts · kahan.ts · regex.ts
      index.ts             Public API barrel
    tests/                 Sentinel suite

  paths/                   @dcgp/paths - Phase B (deferred)
  opencode/                @dcgp/opencode - Phase C (deferred)
  vscode/                  dcgp-vscode - Phase D (deferred)
  cli/                     @dcgp/cli - Phase D (deferred)

DCGP-SPEC.md               Normative specification
AGENTS.md                  Agent mounting guide
dcgp.schema.json           JSON Schema for VS Code IntelliSense
scripts/verify-dcgp.sh     Executable compliance check
COMPLIANCE                 Single line: FULL+EXTENDED
```

Las fases B, C y D están explícitamente deferidas. Este README no reclama lo que no está construido.

---

## Punto de montaje para agentes

Si eres un agente de IA que opera en esta base de código, lee [`AGENTS.md`](./AGENTS.md). Contiene la especificación operativa, las constantes de fórmula, la lista de prohibiciones y la línea base de verificación. Es la única fuente de verdad para el comportamiento del agente.

---

*DCGP v1.0.0-rc · @addicted2crypto · Licencia MIT*
