---
name: synergos-test-author
description: Escribe tests xUnit para seams de Synergos CMS siguiendo los 4 casos canónicos del proyecto — empty, happy, filter, idempotent (ADR 0075). Conoce los frameworks (xUnit + NSubstitute + FluentAssertions), las trampas de NSubstitute en Umbraco, y los patrones de mock para IBundleRegistryClient, ISynHostEmitter, IBrandingProvider e IAuditTrailWriter. Cubre también los gates que leen la fuente del disco: mutar cada uno y comprobar que la mutación entró, acotar la aserción a su frase y no al fichero entero (la lección de SegundoConsumidorTests), los dos sentidos, la lista antes que la cifra y la red por el vacío. Invocar cuando se crea un nuevo seam o se modifica uno existente, o al escribir o endurecer un gate.
---

# SYNERGOS Test Author — escribir tests xUnit para seams

Cada nuevo seam en Synergos debe llegar con tests. El gate fue levantado en la Ola 190 (post-migración completa) pero la expectativa sigue: ADR 0075 establece que cada seam nuevo tiene al menos los 4 casos canónicos.

---

## 0. Ubicación y estructura del proyecto de tests

```
Synergos.CMS/
└── Synergos.CMS.Tests/
    ├── Synergos.CMS.Tests.csproj
    ├── Application/
    │   ├── BundleRegistry/       ← tests de IBundleRegistryClient
    │   ├── Analytics/            ← tests de IAnalyticsTracker
    │   └── Audit/                ← tests de IAuditTrailWriter
    ├── Infrastructure/
    │   ├── SynHost/              ← tests de ISynHostEmitter
    │   └── Branding/             ← tests de IBrandingProvider
    └── Web/
        └── Composers/            ← tests de composers si aplica
```

---

## 1. Frameworks y versiones

```xml
<!-- Del .csproj — no cambiar versiones sin verificar compatibilidad con Umbraco 13 -->
<PackageReference Include="xunit" Version="2.x.x" />
<PackageReference Include="NSubstitute" Version="5.x.x" />
<PackageReference Include="FluentAssertions" Version="6.x.x" />
<PackageReference Include="Microsoft.NET.Test.Sdk" />
```

---

## 2. Los 4 casos canónicos (ADR 0075)

Cada seam nuevo debe tener al menos:

| Caso | Test name suffix | Descripción |
|------|-----------------|-------------|
| `empty` | `_WhenEmpty_Returns…` | Input vacío / null / lista vacía → resultado vacío/default válido |
| `happy` | `_WhenValid_Returns…` | Input completo y correcto → resultado esperado |
| `filter` | `_WhenFiltered_Returns…` | Input parcial (algunos nulos/inválidos) → solo los válidos pasan |
| `idempotent` | `_IsIdempotent` | Llamar 2+ veces con el mismo input → mismo resultado sin side effects |

---

## 3. Template base de clase de test

```csharp
using FluentAssertions;
using NSubstitute;
using Xunit;
using Synergos.CMS.Interfaces;
// ... otros using según el seam

namespace Synergos.CMS.Tests.Application.{Seam};

public class {SeamName}Tests
{
    private readonly {ISeamInterface} _sut;
    // Dependencias mockeadas
    private readonly {IDependency} _{dep};

    public {SeamName}Tests()
    {
        _{dep} = Substitute.For<{IDependency}>();
        _sut   = new {ConcreteImplementation}(_{dep});
    }

    // ── empty ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task {Method}_WhenEmpty_Returns{Expected}()
    {
        // Arrange — input vacío / null
        var input = {EmptyInput};

        // Act
        var result = await _sut.{Method}(input);

        // Assert
        result.Should().Be{ExpectedEmpty}();
    }

    // ── happy ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task {Method}_WhenValid_Returns{Expected}()
    {
        // Arrange
        var input   = {ValidInput};
        var expected = {ExpectedOutput};
        _{dep}.{DepMethod}(Arg.Any<{T}>()).Returns(expected);

        // Act
        var result = await _sut.{Method}(input);

        // Assert
        result.Should().Be(expected);
        await _{dep}.Received(1).{DepMethod}(Arg.Is<{T}>(x => x.{Prop} == {Value}));
    }

    // ── filter ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task {Method}_WhenInvalidInput_Returns{EmptyOrDefault}(string? input)
    {
        // Act
        var result = await _sut.{Method}(input);

        // Assert
        result.Should().Be{EmptyOrDefault}();
        await _{dep}.DidNotReceive().{DepMethod}(Arg.Any<{T}>());
    }

    // ── idempotent ────────────────────────────────────────────────────────────

    [Fact]
    public async Task {Method}_IsIdempotent()
    {
        // Arrange
        var input   = {ValidInput};
        _{dep}.{DepMethod}(Arg.Any<{T}>()).Returns({ExpectedOutput});

        // Act — llamar 2 veces
        var result1 = await _sut.{Method}(input);
        var result2 = await _sut.{Method}(input);

        // Assert — mismo resultado, sin side effects extra
        result1.Should().BeEquivalentTo(result2);
        await _{dep}.Received(2).{DepMethod}(Arg.Any<{T}>());  // exactamente 2, no más
    }
}
```

---

## 4. Mocks de seams canónicos de Synergos

### IBundleRegistryClient

```csharp
var bundleRegistry = Substitute.For<IBundleRegistryClient>();

// Happy: bundle encontrado
bundleRegistry
    .GetBundleAsync("accordion", Arg.Any<CancellationToken>())
    .Returns(Task.FromResult<BundleEntry?>(new BundleEntry
    {
        Name    = "accordion",
        Tag     = "synergos-accordion",
        MainUrl = "/cdn-bundles/synergos/accordion/angular/latest/main.js",
        Integrity = "sha384-abc123"
    }));

// Empty: bundle no encontrado
bundleRegistry
    .GetBundleAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
    .Returns(Task.FromResult<BundleEntry?>(null));
```

### ISynHostEmitter

```csharp
var emitter = Substitute.For<ISynHostEmitter>();

// Happy: emitir HTML
var fakeResult = new SynHostEmitResult(
    ScriptHtml: "<script src=\"/cdn-bundles/synergos/accordion/angular/latest/main.js\"></script>",
    ElementHtml: "<synergos-accordion heading=\"Test\"></synergos-accordion>"
);
emitter
    .EmitAsync(Arg.Is<SynHostEmitRequest>(r => r.BlockAlias == "accordion"))
    .Returns(Task.FromResult(fakeResult));

// Stub/fallback
emitter
    .EmitAsync(Arg.Any<SynHostEmitRequest>())
    .Returns(Task.FromResult(SynHostEmitResult.Empty));
```

### IBrandingProvider

```csharp
var brandingProvider = Substitute.For<IBrandingProvider>();
brandingProvider.GetBranding().Returns(new BrandingContext
{
    SiteKey   = Guid.NewGuid(),
    SiteName  = "Test Site",
    ThemeColor = "#0F58A7"
});
```

### IAuditTrailWriter (append-only — verificar que no muta)

```csharp
var auditWriter = Substitute.For<IAuditTrailWriter>();

// Verificar que se llamó exactamente una vez por operación
await auditWriter.Received(1).WriteAsync(
    Arg.Is<AuditEntry>(e =>
        e.EventType == "ContentPublished" &&
        e.EntityKey  == expectedKey));

// Verificar que NO se llamó (operación read-only no debe auditar)
await auditWriter.DidNotReceive().WriteAsync(Arg.Any<AuditEntry>());
```

### IAnalyticsTracker (fire-and-forget — verificar disparo no bloqueo)

```csharp
var analyticsTracker = Substitute.For<IAnalyticsTracker>();

// Verificar que se disparó el evento
analyticsTracker.Received(1).Track(
    Arg.Is<AnalyticsEvent>(e =>
        e.Name == "page_view" &&
        e.Properties.ContainsKey("url")));
```

---

## 5. TRAMPA NSubstitute — Returns dentro de Returns

**Patrón prohibido:**

```csharp
// MAL — configura el substitute DENTRO del argumento de otro Returns
// NSubstitute confunde el "last call" tracker y el mock queda mal configurado
var sut = new MyService(
    bundleRegistry.GetBundleAsync("x").Returns(  // ← esto interfiere con el tracker externo
        someOtherSub.Method().Returns(value)));   // ← never do this
```

**Patrón correcto:**

```csharp
// BIEN — construir el substitute por separado ANTES de pasarlo como argumento
var innerResult = new BundleEntry { Name = "accordion" };
bundleRegistry
    .GetBundleAsync("accordion", Arg.Any<CancellationToken>())
    .Returns(Task.FromResult<BundleEntry?>(innerResult));

var sut = new MyService(bundleRegistry);
```

---

## 6. Tests para seams con cultura (Variations=Culture)

Cuando el seam maneja propiedades culture-variant, usar `CultureInfo` en los tests:

```csharp
[Theory]
[InlineData("es-co")]
[InlineData("en-us")]
public async Task Render_ReturnsLocalizedContent_ForCulture(string culture)
{
    // Arrange
    var cultureInfo = new CultureInfo(culture);
    Thread.CurrentThread.CurrentUICulture = cultureInfo;

    // El request lleva la cultura
    var request = new SynHostEmitRequest(
        BlockAlias:           "hero-banner",
        Props:                new Dictionary<string, object?> { ["heading"] = $"Heading in {culture}" },
        ConfigOverrideJson:   null,
        Culture:              cultureInfo);

    // Act + Assert
    var result = await _sut.EmitAsync(request);
    result.ElementHtml.Should().Contain(culture);
}
```

---

## 7. Tests para IOptionsMonitor (Polly hot-reload)

Para seams que usan `IOptionsMonitor<T>`:

```csharp
var optionsMonitor = Substitute.For<IOptionsMonitor<BundleRegistrySettings>>();
optionsMonitor.CurrentValue.Returns(new BundleRegistrySettings
{
    Mode        = "FileSystem",
    // Un directorio del propio test, nunca la ruta de una máquina: el #132 encontró los tests del
    // probe usando una como literal de fixture, o sea el defecto escrito como si fuera lo normal.
    LocalPath   = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N")),
    RegistryFileName = "registry.json"
});

// Simular cambio de configuración en caliente
optionsMonitor.OnChange(Arg.Invoke(new BundleRegistrySettings { Mode = "Stub" }));
```

---

## 8. Convenciones de naming de tests

```
{SeamName}Tests.cs
  · {Method}_WhenEmpty_ReturnsEmpty
  · {Method}_WhenNull_ThrowsArgumentNullException   (si aplica)
  · {Method}_WhenValid_ReturnsExpected
  · {Method}_WhenOneItemNull_ReturnsOnlyValid        (filter case)
  · {Method}_IsIdempotent
  · {Method}_WhenDependencyFails_Returns{Fallback}   (resilience)
  · {Method}_WhenCancelled_ThrowsOperationCanceledException
```

---

## 9. Ejecutar los tests

```powershell
$testProject = "Synergos.CMS\Synergos.CMS.Tests\Synergos.CMS.Tests.csproj"

# Todos
dotnet test $testProject --logger "console;verbosity=normal"

# Solo un seam específico
dotnet test $testProject --filter "FullyQualifiedName~BundleRegistry" --logger "console;verbosity=normal"

# Con cobertura
dotnet test $testProject --collect:"XPlat Code Coverage" --results-directory coverage/

# Ver resumen
dotnet test $testProject --logger "trx;LogFileName=results.trx"
```

**Resultado esperado:** la cifra de cada suite no se copia acá: la dice su propia corrida y la
cuadra `SuiteCountTests` contra su ensamblado (`CLAUDE.md` §0.A.9 del CMS). Las suites son proyectos
separados —hoy `Synergos.CMS.Tests`, `backend/Synergos.Servicios.Tests` y
`Synergos.Arquitectura.Tests`; la lista viva es `find . -name "*Tests.csproj"` en el CMS— y se
reporta cada una por separado. Si algún test falla después de los cambios, no cerrar la Ola
(`synergos-ola-close` lo verifica).

**En Windows hay rojos de entorno** con nombre y causa (#170; `CLAUDE.md` §5 del CMS,
`feedback_a_dev_machine_is_not_ci`): se nombran por test y por ticket, y **cualquier rojo que no sea
uno de ésos es real**. Nunca «son los de siempre» sin mirar el nombre (`synergos-medir` §5).

---

## 10. Los gates que leen la fuente (`Synergos.Arquitectura.Tests`)

Muchos gates del CMS no usan un tipo de producción: leen el disco —una guía, una vista, un `.mjs`,
un compose— y afirman algo sobre él. Tienen sus propias trampas, y la auditoría de reutilización
(#172) encontró una en un gate que estaba en verde.

### 10.1 Todo gate se muta, y se comprueba que la mutación entró

Se reintroduce el defecto que el gate dice cazar, se ve el **rojo**, y se restaura **tocando el
fichero** (doc 12 §5.10 del CMS). Antes de creerle al resultado, `git diff` confirma que la mutación
está puesta: una que no se aplicó —un fin de línea distinto, un patrón que no casó— deja el verde y se
lee como verificación. Un gate que nunca se vio fallar no vigila nada.

### 10.2 La aserción se acota a SU frase, no al fichero entero

`SegundoConsumidorTests` comprobaba que `CLAUDE.md` nombrara cada capacidad sin consumidor con
`guia.Contains("`Api.X`")` sobre la guía **entera**: cualquier otra mención entre backticks, en
cualquier sección, la daba por nombrada. Medido en el #172: con `Api.Catalog` quitada de la lista,
el gate seguía verde porque la guía la nombra en otros sitios; y una tabla nueva con los nombres
entre backticks lo cegaba para cuatro capacidades más. El arreglo fue cortar la **frase** que
empieza en su marca («Con **ninguno**,») hasta el punto seguido, y cruzarla en los dos sentidos:

```csharp
var frase = Frase(guia, "Con **ninguno**,");   // desde la marca hasta ". "
var faltan = delDisco.Where(c => !frase.Contains($"`Api.{Capitalizar(c)}`", StringComparison.OrdinalIgnoreCase));
var deMas  = Regex.Matches(frase, @"`Api\.(\w+)`").Select(m => m.Groups[1].Value.ToLowerInvariant())
                  .Where(c => !delDisco.Contains(c, StringComparer.Ordinal));
```

**La mutación que lo prueba** es la del defecto: quitar el nombre de la frase **y dejarlo en otra
parte del fichero**. Si el gate sigue verde, está mirando el fichero y no la frase.

### 10.3 Las otras cuatro, que ya costaron

- **Los dos sentidos**: lo que el disco tiene y la guía no nombra, **y** lo que la guía nombra y el
  disco ya no tiene. Un censo vigilado en uno solo queda mintiendo.
- **Una lista, no una cifra**: con un número, quitar uno y poner otro pasa en verde (UI regla 39).
- **Red por el vacío**: si el descubrimiento devuelve cero —o todo igual— el gate **falla**; un
  recorrido que encuentra una sola carpeta pasa en verde sin mirar nada (`CLAUDE.md` §2 del CMS,
  nota de `RutasDeProyectoTests`).
- **Contar menciones de un tipo no es contar usos**: el sujeto se cuenta a sí mismo
  (`feedback_counting_mentions_of_a_type_measures_the_opposite_of_using_it`, `synergos-medir` §1).

### 10.4 Lo que un test del CMS no ve: el cable hacia el elemento

Si el seam termina en una vista SynHost, un test del CMS prueba lo que la vista **emite**, y el
elemento se prueba con **sus** claves: el cable entre los dos no lo prueba nadie (D1). El test que
importa está del lado de la UI: un spec que le da al elemento el `config` **exacto** que emite la
vista (`synergos-contract-drift` §7.3).
