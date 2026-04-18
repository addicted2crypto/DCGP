import { definePath } from "@dcgp/core";

export const dataEngineering = definePath({
  id: "data-engineering",
  version: "1.0.0",
  name: "Data Engineering",
  description: "ETL/ELT pipelines, dbt, Airflow, Spark, warehouse SQL.",
  tags: ["data", "etl", "sql"],
  signals: {
    packages: ["apache-airflow", "dbt-core", "pyspark", "pandas", "duckdb", "sqlalchemy"],
    files: ["dbt_project.yml", "dags/**/*.py", "profiles.yml", "models/**/*.sql"],
    keywords: ["dbt", "airflow", "spark", "warehouse", "bigquery", "snowflake", "redshift", "duckdb"],
  },
  anchors: [
    {
      id: "stack",
      label: "Data engineering stack",
      priority: 100,
      content:
        "Pipelines orchestrated via Airflow or Dagster. Transformations in dbt. Warehouse: BigQuery, Snowflake, Redshift, or DuckDB. Prefer SQL-first; use Python only where SQL cannot express the logic.",
    },
    {
      id: "practices",
      label: "Data engineering practices",
      priority: 85,
      content:
        "Idempotent tasks (re-running produces same result). Incremental models where possible. Schema-on-read is a last resort; prefer schema contracts. Test models with dbt tests. Never write without a backup of the target table.",
    },
  ],
  gates: [
    {
      id: "select-star",
      pattern: "SELECT\\s+\\*\\s+FROM\\s+[a-zA-Z_]+\\s*(?:;|$)",
      severity: "warn",
      message: "Avoid SELECT * in production models. Enumerate columns explicitly.",
      context: "output",
    },
    {
      id: "no-where-delete",
      pattern: "DELETE\\s+FROM\\s+\\w+\\s*(?:;|$)",
      severity: "critical",
      message: "DELETE without WHERE clause will wipe the table.",
      context: "output",
    },
  ],
  driftRules: [],
  compression: {
    summarizeAs: "Data engineering session",
    neverPrune: ["dbt_project.yml", "profiles.yml", "models/**"],
  },
});
