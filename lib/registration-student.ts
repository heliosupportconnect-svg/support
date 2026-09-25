type StudentRegistrationDetails = {
  name: string
  className: string
  section: string
  rollNumber: string
  house: string
}

type ExistingStudent = {
  firstName: string
  lastName: string
  className: string
  section: string
  rollNumber: string
  house: string
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function matchesExistingStudent(details: StudentRegistrationDetails, student: ExistingStudent): boolean {
  return normalize(details.name) === normalize(`${student.firstName} ${student.lastName}`) &&
    normalize(details.className) === normalize(student.className) &&
    normalize(details.section) === normalize(student.section) &&
    normalize(details.rollNumber) === normalize(student.rollNumber) &&
    normalize(details.house) === normalize(student.house)
}