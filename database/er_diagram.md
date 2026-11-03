# MediVault: Entity-Relationship (ER) Architecture & Database Normalization

## 1. Relational Database Design Overview
MediVault is engineered on **MySQL 8.0+** using the **InnoDB** ACID-compliant transactional storage engine with **utf8mb4** encoding. The architecture models hospital record operations, role-based access control, medical histories, prescription safety, diagnostic lab workflows, and regulatory compliance logging.

---

## 2. Mermaid Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ PATIENTS : "assigned as primary doctor"
    USERS ||--o| PATIENTS : "authenticated patient account"
    USERS ||--o{ MEDICAL_HISTORY : "records medical event"
    USERS ||--o{ PRESCRIPTIONS : "prescribes medication"
    USERS ||--o{ TEST_RECORDS : "orders diagnostic test"
    USERS ||--o{ TEST_RECORDS : "evaluates & verifies test"
    USERS ||--o{ PATIENT_ACCESS_GRANTS : "granted access"
    USERS ||--o{ PATIENT_ACCESS_GRANTS : "grants provider access"
    USERS ||--o{ AUDIT_LOGS : "performs auditable action"

    PATIENTS ||--o{ MEDICAL_HISTORY : "has clinical timeline"
    PATIENTS ||--o{ PRESCRIPTIONS : "receives prescriptions"
    PATIENTS ||--o{ TEST_RECORDS : "undergoes lab tests"
    PATIENTS ||--o{ PATIENT_ACCESS_GRANTS : "grants consent"

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string role "Admin, Doctor, Patient, Lab Technician"
        string phone
        string specialization
        string license_number
        datetime created_at
        datetime updated_at
    }

    PATIENTS {
        int id PK
        string patient_id UK "e.g. MV-2026-0001"
        int user_id FK "nullable, 1-to-1 with USERS"
        string first_name
        string last_name
        date dob
        string gender "Male, Female, Other"
        string blood_group "A+, B+, O+, AB+, etc."
        string phone
        string email
        string address
        decimal height_cm
        decimal weight_kg
        text allergies
        text chronic_conditions
        string emergency_contact_name
        string emergency_contact_phone
        string emergency_contact_relation
        int assigned_doctor_id FK
        tinyint is_deleted "0=active, 1=archived"
        datetime created_at
        datetime updated_at
    }

    MEDICAL_HISTORY {
        int id PK
        int patient_id FK
        date record_date
        string record_type "Diagnosis, Surgery, Visit, Vaccination, Hospitalization"
        string title
        int doctor_id FK
        string doctor_name
        string facility
        string severity "Routine, Mild, Moderate, Severe, Critical"
        text notes
        datetime created_at
    }

    PRESCRIPTIONS {
        int id PK
        int patient_id FK
        int doctor_id FK
        string medication_name
        string dosage
        string frequency
        string duration
        date start_date
        date end_date
        text instructions
        string status "Active, Completed, Cancelled"
        text notes
        datetime created_at
        datetime updated_at
    }

    TEST_RECORDS {
        int id PK
        int patient_id FK
        int ordered_by_doctor_id FK
        int technician_id FK
        string test_name
        string category "Blood, Imaging, Urine, Stool, etc."
        date ordered_date
        date completed_date
        string result_value
        string unit
        string reference_range
        string flag "Normal, High, Low, Critical, Pending"
        string status "Ordered, In Progress, Completed, Cancelled"
        text notes
        datetime created_at
        datetime updated_at
    }

    PATIENT_ACCESS_GRANTS {
        int id PK
        int patient_id FK
        int doctor_id FK
        int granted_by FK
        string status "Granted, Revoked, Expired"
        datetime expires_at
        text notes
        datetime created_at
        datetime updated_at
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
        string user_email
        string user_role
        string action "LOGIN, VIEW, CREATE, UPDATE, DELETE, ACCESS_GRANT"
        string resource "PATIENT, PRESCRIPTION, TEST, ACCESS, AUDIT"
        string resource_id
        text details
        string ip_address
        datetime created_at
    }
```

---

## 3. Database Normalization Analysis

### First Normal Form (1NF)
- **Atomic Attributes**: All columns contain scalar, atomic values. Names are partitioned into `first_name` and `last_name`, addresses into structured fields, dates into native `DATE`/`DATETIME` types, and numbers into structured decimal/integer formats.
- **Unique Primary Keys**: Every entity has a surrogate auto-increment primary key (`id`) and immutable natural business identifiers (such as `patient_id` MV-YYYY-XXXX and `email`).
- **No Repeating Groups**: Prescriptions, test records, history timelines, and access authorizations are held in distinct normalized child tables rather than delimited strings or array columns.

### Second Normal Form (2NF)
- **1NF Compliance**: Satisfies all 1NF invariants.
- **Full Functional Dependency**: No non-key attribute depends on a subset of a composite candidate key. All entities utilize single-column surrogate keys (`id INT AUTO_INCREMENT PRIMARY KEY`), ensuring all non-key columns depend wholly on the entire primary key.
- **Composite Unique Constraints**: Constraints like `patient_access_grants(patient_id, doctor_id)` ensure uniqueness across relational pairs without creating partial dependencies.

### Third Normal Form (3NF)
- **2NF Compliance**: Satisfies all 2NF invariants.
- **Elimination of Transitive Dependencies**: Non-key attributes do not depend on other non-key attributes. For instance:
  - Doctor details (`specialization`, `license_number`) reside strictly in `users`, never duplicated in `patients`, `prescriptions`, or `test_records`.
  - Child tables reference `doctor_id` via foreign keys rather than storing redundant doctor profile data.
  - Calculated attributes such as patient age or body mass index (BMI) are derived dynamically via SQL functions (`TIMESTAMPDIFF`, `CURDATE()`, or views) rather than stored as persisted columns susceptible to update anomalies.

### Boyce-Codd Normal Form (BCNF)
- For every non-trivial functional dependency $X \rightarrow Y$, $X$ is a superkey.
- In `patient_access_grants`, `(patient_id, doctor_id)` uniquely determines the grant record and is declared as an explicit `UNIQUE KEY`, guaranteeing BCNF compliance.

---

## 4. Integrity Constraints & Foreign Key Rules

| Child Table | Foreign Key Column | Parent Table | On Delete Action | Rationale |
|---|---|---|---|---|
| `patients` | `user_id` | `users(id)` | `SET NULL` | Removing a login account does not delete clinical health records. |
| `patients` | `assigned_doctor_id` | `users(id)` | `SET NULL` | Provider reassignment or deactivation preserves patient record. |
| `medical_history` | `patient_id` | `patients(id)` | `CASCADE` | Timeline entries belong exclusively to the patient record. |
| `prescriptions` | `patient_id` | `patients(id)` | `CASCADE` | Patient deletion purges associated prescription records. |
| `prescriptions` | `doctor_id` | `users(id)` | `RESTRICT` | Physicians cannot be deleted if active prescription orders reference them. |
| `test_records` | `patient_id` | `patients(id)` | `CASCADE` | Diagnostics belong to the patient lifecycle. |
| `patient_access_grants`| `patient_id` | `patients(id)` | `CASCADE` | Consent grants are tied to the patient record. |
| `audit_logs` | `user_id` | `users(id)` | `SET NULL` | Compliance trails persist permanently even if accounts are purged. |

