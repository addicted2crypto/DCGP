import { definePath } from "@dcgp/core";

export const dotnet = definePath({
  id: "dotnet",
  version: "1.0.0",
  name: ".NET / C#",
  description: ".NET 8/9 C# backend. ASP.NET Core, Entity Framework.",
  tags: ["backend", "csharp", "dotnet"],
  signals: {
    files: ["*.csproj", "*.sln", "Program.cs", "appsettings.json", "global.json"],
    packages: ["Microsoft.AspNetCore", "Microsoft.EntityFrameworkCore", "Serilog", "xunit"],
    keywords: ["dotnet", "csharp", "aspnet", "efcore"],
  },
  anchors: [
    {
      id: "stack",
      label: ".NET stack identity",
      priority: 100,
      content:
        ".NET 8 or 9. C# 12+. ASP.NET Core for web. EF Core for data. xUnit for tests. Nullable reference types enabled. File-scoped namespaces.",
    },
    {
      id: "conventions",
      label: "Idioms",
      priority: 80,
      content:
        "Use async/await with CancellationToken on I/O. Minimal APIs for new endpoints. Dependency injection via IServiceCollection. Use records for DTOs.",
    },
  ],
  gates: [
    {
      id: "no-task-result",
      pattern: "\\.Result\\b|\\.Wait\\(\\)",
      severity: "error",
      message: "Never block on Task with .Result or .Wait(); use await.",
      context: "output",
    },
    {
      id: "no-console-writeline",
      pattern: "Console\\.WriteLine",
      severity: "warn",
      message: "Use ILogger, not Console.WriteLine, outside Program.cs bootstrap.",
      context: "output",
    },
  ],
  driftRules: [
    {
      sourceDomain: "java",
      pattern: "\\bpublic class\\b.*\\{[^}]*public static void main",
      severity: "warn",
      correction: "This is C#/.NET. Use Program.cs and top-level statements, not Java main.",
    },
  ],
  compression: {
    summarizeAs: ".NET development session",
    neverPrune: ["*.csproj", "Program.cs", "appsettings.json"],
  },
});
