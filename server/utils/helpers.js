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

const crypto = require('crypto');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required.' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long.' };
  }
  return { valid: true };
}

/**
 * Universal date normalizer: converts any valid date string or Date object into 'YYYY-MM-DD'.
 * Handles:
 * - 'YYYY-MM-DD', 'YYYY/MM/DD'
 * - 'DD-MM-YYYY', 'DD/MM/YYYY'
 * - '04 May 2007', 'May 04, 2007', '4-May-2007'
 * - JavaScript Date objects (without timezone drift)
 */
function normalizeDateToYMD(d) {
  if (!d) return '';
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const str = String(d).trim();
  // 1. Direct YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}`;
  }
  // 2. DD-MM-YYYY or DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  // 3. Named month: e.g. '04 May 2007', 'May 04, 2007', '4-May-2007'
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const namedMatch1 = str.match(/^(\d{1,2})[-/\s]+([a-zA-Z]{3,})[-/\s,]+(\d{4})/);
  if (namedMatch1) {
    const day = String(namedMatch1[1]).padStart(2, '0');
    const monthKey = namedMatch1[2].toLowerCase().substring(0, 3);
    const m = months[monthKey];
    const y = namedMatch1[3];
    if (m) return `${y}-${m}-${day}`;
  }
  const namedMatch2 = str.match(/^([a-zA-Z]{3,})[-/\s]+(\d{1,2})[-/\s,]+(\d{4})/);
  if (namedMatch2) {
    const monthKey = namedMatch2[1].toLowerCase().substring(0, 3);
    const m = months[monthKey];
    const day = String(namedMatch2[2]).padStart(2, '0');
    const y = namedMatch2[3];
    if (m) return `${y}-${m}-${day}`;
  }
  // Fallback to local calendar components
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

function generateSecurePassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';

  let pwd = '';
  const pick = (chars, count) => {
    let r = '';
    for (let i = 0; i < count; i++) {
      r += chars[crypto.randomInt(0, chars.length)];
    }
    return r;
  };

  pwd += pick(uppercase, 3);
  pwd += pick(lowercase, 4);
  pwd += pick(numbers, 3);
  pwd += pick(symbols, 2);

  // Shuffle
  return pwd.split('').sort(() => crypto.randomInt(-1, 2)).join('');
}

module.exports = {
  generatePatientId,
  calculateAge,
  calculateBmi,
  checkDrugAllergyConflict,
  autoFlagTestResult,
  isValidEmail,
  validatePassword,
  normalizeDateToYMD,
  generateSecurePassword
};
