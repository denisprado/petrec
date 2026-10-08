# PetRec — Assistente Inteligente de Cuidados do Pet

Aplicativo web responsivo e **mobile-first** para gerenciamento colaborativo de cuidados, medicamentos, alimentação, estoque, saúde e compromissos de animais de estimação.

---

## 🎯 Princípio Central

> **O estoque e o consumo real determinam quando algo precisa ser comprado.**
> O sistema não depende de lembretes fixos de dia de mês. Ele calcula continuamente o estoque remanescente com base no consumo real e gera alertas inteligentes com antecedência configurada (Lead Time).

---

## 🚀 Como Executar

O projeto já está totalmente configurado com **SQLite local (zero dependência externa)** e dados de demonstração semeados:

1. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```

2. Abrir no navegador:
[http://localhost:3000](http://localhost:3000)

3. (Opcional) Visualizar o banco de dados via Prisma Studio:
```bash
npm run db:studio
```

---

## 👥 Cenário de Demonstração Pré-carregado

* **Pet Principal**: Rex (Golden Retriever, 32.5 kg)
* **Pets Secundários**: Luna (Siamês - vacina em 12 dias), Thor (Bulldog - tudo em dia)
* **Tutores Associados**:
  * **Denis Forigo** — *Owner* (Proprietário)
  * **Ana Silva** — *Co-owner* (Coproprietária)
  * **João Cuidador** — *Caregiver* (Cuidador)
* **Troca Rápida de Tutor**:
  * No topo da página (header), você pode alternar entre Denis, Ana e João para testar permissões (RBAC) e auditoria colaborativa (*"Administrado por Ana"*, *"Comprado por Denis"*).
* **Ração**: 12 kg (400g/dia) com lead time de 7 dias. Com 2kg restantes, o sistema já dispara o alerta **COMPRAR AGORA**.
* **Medicamentos**: Apoquel 16mg e Condroton Plus com registro de horário (08:00 e 20:00).
