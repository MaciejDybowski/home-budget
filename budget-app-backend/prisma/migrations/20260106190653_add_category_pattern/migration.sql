-- CreateTable
CREATE TABLE "CategoryPattern" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,

    CONSTRAINT "CategoryPattern_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CategoryPattern" ADD CONSTRAINT "CategoryPattern_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
