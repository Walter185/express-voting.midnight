# Express Voting & Midnight DNI Private Voting DApp (Argentina)

Sistema de **Votación Privada Express** utilizando el **DNI Argentino** sobre la red **Midnight Network** mediante pruebas de conocimiento cero (Zero-Knowledge Proofs - ZK) y contratos inteligentes escritos en **Compact**.

---

## 🚀 Características Principales

1. **Validación de DNI Argentino (API Gobierno / Padrón Electoral)**:
   - Verificación de DNI (7 u 8 dígitos), Número de Trámite (11 dígitos), Sexo y Fecha de Nacimiento contra el servicio de Padrón Electoral / API RENAPER.
2. **Prueba ZK de Mayoría de Edad (>= 18 Años)**:
   - El circuito Compact verifica en ZK que el votante sea mayor de edad sin exponer la fecha de nacimiento ni el DNI a la cadena de bloques.
3. **Elección entre Candidato A y Candidato B**:
   - Votación anónima entre **Candidato A (Lista Verde)** y **Candidato B (Lista Azul)**.
4. **Prevención de Doble Voto (Nullifier)**:
   - Se genera un *DNI Nullifier* derivado criptográficamente en el navegador.
   - El contrato inteligente registra en el ledger público `votedNullifiers[hash] = true` para **bloquear cualquier intento de voto duplicado**, preservando el secreto absoluto del voto.

---

## 🏗️ Arquitectura del Sistema

```
 +-----------------------------------------------------------------------+
 |                 Cliente Web (Next.js 14 - Frontend)                   |
 |  1. Formulario DNI Argentino (DNI, Sexo, Nro. Trámite, Nacimiento)    |
 |  2. Consulta API Gobierno (RENAPER / Padrón Electoral) -> Válido      |
 |  3. Selección de Voto: [Candidato A]  o  [Candidato B]               |
 |  4. Cálculo de Witness Privado: Nullifier + Edad + Opción             |
 +-----------------------------------------------------------------------+
                                     |
                                     v
 +-----------------------------------------------------------------------+
 |                    Midnight Proof Server (Docker)                     |
 |  Compila circuito Compact `castVote`:                                 |
 |  - Valida Age >= 18                                                   |
 |  - Valida que Nullifier no haya votado previamente                    |
 |  - Incrementa contador de Candidato A o B en Ledger                   |
 +-----------------------------------------------------------------------+
                                     |
                                     v
 +-----------------------------------------------------------------------+
 |                     Red Midnight (Ledger Público)                     |
 |  - votedNullifiers[hash] = true                                       |
 |  - votesCandidateA++ / votesCandidateB++                              |
 +-----------------------------------------------------------------------+
```

---

## 📁 Estructura de Directorios

```
express-voting.midnight/
├── contract/
│   └── dni_verifier.compact       # Contrato inteligente Compact con circuito castVote ZK
├── app/
│   ├── Dockerfile.app              # Dockerfile multi-stage para Next.js
│   ├── package.json                # Dependencias del proyecto Next.js 14
│   ├── tsconfig.json               # Configuración TypeScript
│   ├── next.config.mjs             # Configuración Next.js con Async WebAssembly
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # Layout global
│       │   ├── page.tsx            # UI interactiva de Votación DNI Argentina
│       │   └── globals.css         # Estilos Glassmorphic
│       └── lib/
│           ├── argentinaDni.ts     # Módulo de validación API Gobierno y DNI Nullifier
│           └── midnight.ts         # Cliente SDK y llamado a Proof Server
├── docker-compose.yml              # Configuración Docker (Proof Server + Web App)
└── README.md                       # Documentación del proyecto
```

---

## 📜 Contrato Compact (`contract/dni_verifier.compact`)

```compact
pragma language_version >= 0.14.0;
import CompactLanguage;

export ledger votesCandidateA: Counter;
export ledger votesCandidateB: Counter;
export ledger votedNullifiers: Map<Bytes<32>, Boolean>;

export circuit castVote(
    birthYear: Uint<16>,
    dniNullifier: Bytes<32>,
    candidateSelection: Uint<8>,
    currentYear: Uint<16>
): [] {
    assert (currentYear - birthYear) >= 18
        "El votante debe ser mayor de 18 años para participar en la elección";

    assert !votedNullifiers.member(dniNullifier)
        "Este DNI ya ha emitido su voto en la elección. El doble voto está prohibido.";

    assert (candidateSelection == 1 || candidateSelection == 2)
        "Opción de candidato no válida. Debe seleccionar Candidato A (1) o Candidato B (2).";

    votedNullifiers.insert(dniNullifier, true);

    if (candidateSelection == 1) {
        votesCandidateA.increment(1);
    } else {
        votesCandidateB.increment(1);
    }
}
```

---

## 🚀 Guía de Ejecución

```bash
# Levantar todo con Docker Compose
docker compose up --build
```

- **Aplicación Web**: [http://localhost:3000](http://localhost:3000)
- **Midnight Proof Server**: [http://localhost:6300](http://localhost:6300)
