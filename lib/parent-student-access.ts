import type { Prisma } from '@prisma/client'

type ParentStudentDelegate = Pick<Prisma.TransactionClient, 'parentStudent'>['parentStudent']

export function findParentOwnedStudentLink(
  parentStudent: ParentStudentDelegate,
  parentId: string,
  studentSelector: string,
) {
  return parentStudent.findFirst({
    where: {
      userId: parentId,
      OR: [
        { studentId: studentSelector },
        { student: { admissionNumber: studentSelector } },
      ],
    },
    include: { student: true },
  })
}