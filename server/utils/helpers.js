/**
 * MediVault Business Logic & Helper Functions
 */

const { query } = require('../config/db');

async function generatePatientId() {
  const currentYear = new Date().getFullYear();
  const prefix = `MV-${currentYear}-`;
  
  // Find highest sequence for current year
  const [rows] = await query(`
    SELECT patient_id FROM patients 
    WHERE patient_id LIKE ? 
    ORDER BY patient_id DESC LIMIT 1
  `, [`${prefix}%`]);

  let nextNum = 1;
  const row = rows[0];
  if (row && row.patient_id) {
    const parts = row.patient_id.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

function calculateAge(dobString) {
  if (!dobString) return null;
  const dob = new Date(dobString);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

function calculateBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const rounded = Math.round(bmi * 10) / 10;
  
  let category = 'Normal';
  if (rounded < 18.5) category = 'Underweight';
  else if (rounded < 25.0) category = 'Normal weight';
  else if (rounded < 30.0) category = 'Overweight';
  else category = 'Obesity';

  return {
    value: rounded,
    category
  };
}

// Drug allergy conflict cross-reference database
const ALLERGY_MAP = {
  penicillin: ['amoxicillin', 'ampicillin', 'penicillin', 'augmentin', 'piperacillin'],
  sulfa: ['sulfamethoxazole', 'bactrim', 'septra', 'sulfasalazine'],
  nsaid: ['ibuprofen', 'aspirin', 'naproxen', 'diclofenac', 'celecoxib', 'advil', 'motrin'],
  aspirin: ['aspirin', 'ecotrin', 'bayer'],
  codeine: ['codeine', 'tylenol with codeine', 'tramadol', 'morphine'],
  tetracycline: ['tetracycline', 'doxycycline', 'minocycline'],
  fluoroquinolone: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin'],
  macrolide: ['azithromycin', 'erythromycin', 'clarithromycin']
};

function checkDrugAllergyConflict(allergiesText, medicationName) {
  if (!allergiesText || !medicationName) return { hasConflict: false };
  
  const med = medicationName.toLowerCase().trim();
  const allergies = allergiesText
    .split(/[,;\n]/)
    .map(a => a.toLowerCase().trim())
    .filter(Boolean);

  for (const allergy of allergies) {
    // Direct match
    if (med.includes(allergy) || allergy.includes(med)) {
      return {
        hasConflict: true,
        matchedAllergy: allergy,
        warning: `Direct allergy conflict detected with recorded allergy '${allergy}'!`
      };
    }

    // Cross-reactive group match
    for (const [groupKey, drugList] of Object.entries(ALLERGY_MAP)) {
      if (allergy.includes(groupKey) || groupKey.includes(allergy)) {
        if (drugList.some(drug => med.includes(drug))) {
          return {
            hasConflict: true,
            matchedAllergy: allergy,
            warning: `High-risk cross-reaction! '${medicationName}' belongs to the ${groupKey.toUpperCase()} class, conflicting with allergy '${allergy}'.`
          };
        }
      }
    }
  }

  return { hasConflict: false };
}

function autoFlagTestResult(valueStr, referenceRange) {
  if (!valueStr || !referenceRange) return 'Normal';
  
  const numVal = parseFloat(valueStr);
  if (isNaN(numVal)) return 'Normal';

  // Expecting ranges like "70 - 100", "< 140", "> 60", "13.5-17.5"
  const rangeMatch = referenceRange.match(/([0-9.]+)\s*[-–to]+\s*([0-9.]+)/i);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    if (!isNaN(low) && !isNaN(high)) {
      if (numVal < low * 0.7 || numVal > high * 1.4) {
        return 'Critical';
      }
      if (numVal < low) return 'Low';
      if (numVal > high) return 'High';
      return 'Normal';
    }
  }

  const ltMatch = referenceRange.match(/<\s*([0-9.]+)/);
  if (ltMatch) {
    const limit = parseFloat(ltMatch[1]);
    if (numVal > limit * 1.5) return 'Critical';
    if (numVal > limit) return 'High';
    return 'Normal';
  }

  const gtMatch = referenceRange.match(/>\s*([0-9.]+)/);
  if (gtMatch) {
    const limit = parseFloat(gtMatch[1]);
    if (numVal < limit * 0.6) return 'Critical';
    if (numVal < limit) return 'Low';
    return 'Normal';
  }

  return 'Normal';
}

module.exports = {
  generatePatientId,
  calculateAge,
  calculateBmi,
  checkDrugAllergyConflict,
  autoFlagTestResult
};
