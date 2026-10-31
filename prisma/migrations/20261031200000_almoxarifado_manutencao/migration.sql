-- CreateEnum
CREATE TYPE "SupplyMovementKind" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA');

-- CreateEnum
CREATE TYPE "SupplyRequestStatus" AS ENUM ('ABERTA', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "WorkOrderKind" AS ENUM ('CORRETIVA', 'PREVENTIVA');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidade',
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyMovement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "SupplyMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sector" TEXT,
    "invoice" TEXT,
    "note" TEXT,
    "requestId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SupplyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "note" TEXT,
    "status" "SupplyRequestStatus" NOT NULL DEFAULT 'ABERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT NOT NULL,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "handledNote" TEXT,

    CONSTRAINT "SupplyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRequestLine" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "delivered" INTEGER,

    CONSTRAINT "SupplyRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "brandModel" TEXT,
    "serial" TEXT,
    "preventiveDays" INTEGER,
    "lastPreventiveAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "WorkOrderKind" NOT NULL DEFAULT 'CORRETIVA',
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "equipmentId" TEXT,
    "description" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'ABERTO',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "solution" TEXT,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_clinicId_name_key" ON "SupplyItem"("clinicId", "name");

-- CreateIndex
CREATE INDEX "SupplyMovement_clinicId_itemId_idx" ON "SupplyMovement"("clinicId", "itemId");

-- CreateIndex
CREATE INDEX "SupplyMovement_requestId_idx" ON "SupplyMovement"("requestId");

-- CreateIndex
CREATE INDEX "SupplyRequest_clinicId_status_idx" ON "SupplyRequest"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyRequestLine_requestId_itemId_key" ON "SupplyRequestLine"("requestId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_clinicId_tag_key" ON "Equipment"("clinicId", "tag");

-- CreateIndex
CREATE INDEX "WorkOrder_clinicId_status_idx" ON "WorkOrder"("clinicId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_equipmentId_idx" ON "WorkOrder"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_clinicId_number_key" ON "WorkOrder"("clinicId", "number");

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequestLine" ADD CONSTRAINT "SupplyRequestLine_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequestLine" ADD CONSTRAINT "SupplyRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequestLine" ADD CONSTRAINT "SupplyRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Quantidades sempre positivas no pedido; movimento nunca zero.
ALTER TABLE "SupplyRequestLine" ADD CONSTRAINT "SupplyRequestLine_quantidade" CHECK ("quantity" > 0 AND ("delivered" IS NULL OR "delivered" >= 0));
ALTER TABLE "SupplyMovement" ADD CONSTRAINT "SupplyMovement_quantidade" CHECK ("quantity" <> 0);

-- Trava de mesma clínica (ver 20261030200000_mesma_clinica).
CREATE TRIGGER "supplymovement_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SupplyMovement"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('itemId', 'SupplyItem', 'requestId', 'SupplyRequest', 'userId', 'User');

CREATE TRIGGER "supplyrequest_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SupplyRequest"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('requestedById', 'User', 'handledById', 'User');

CREATE TRIGGER "supplyrequestline_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SupplyRequestLine"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('requestId', 'SupplyRequest', 'itemId', 'SupplyItem');

CREATE TRIGGER "workorder_mesma_clinica"
BEFORE INSERT OR UPDATE ON "WorkOrder"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('equipmentId', 'Equipment', 'openedById', 'User', 'closedById', 'User');

-- Movimento do almoxarifado não muda nem some (erro se corrige com ajuste).
CREATE TRIGGER supplymovement_imutavel
BEFORE UPDATE OR DELETE ON "SupplyMovement"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_total();

-- Itens e equipamentos têm histórico: desativa, não apaga.
CREATE TRIGGER supplyitem_sem_exclusao
BEFORE DELETE ON "SupplyItem"
FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao();

CREATE TRIGGER equipment_sem_exclusao
BEFORE DELETE ON "Equipment"
FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao();

-- Pedido atendido ou cancelado não muda mais; nenhum pedido se apaga.
CREATE OR REPLACE FUNCTION bloquear_pedido_material_encerrado()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pedidos de material não podem ser excluídos; cancele';
  END IF;
  IF OLD."status" <> 'ABERTA' THEN
    RAISE EXCEPTION 'Pedido de material já atendido ou cancelado não pode ser alterado';
  END IF;
  IF NEW."sector" IS DISTINCT FROM OLD."sector" OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'O pedido de material não pode trocar de setor ou de quem pediu';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplyrequest_imutavel
BEFORE UPDATE OR DELETE ON "SupplyRequest"
FOR EACH ROW EXECUTE FUNCTION bloquear_pedido_material_encerrado();

-- Linha do pedido: só a quantidade entregue muda, e só enquanto o pedido está aberto.
CREATE OR REPLACE FUNCTION conferir_linha_pedido_material()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Itens do pedido de material não podem ser excluídos';
  END IF;
  IF (to_jsonb(NEW) - 'delivered') IS DISTINCT FROM (to_jsonb(OLD) - 'delivered') THEN
    RAISE EXCEPTION 'Só a quantidade entregue do item pode mudar';
  END IF;
  IF (SELECT "status" FROM "SupplyRequest" WHERE "id" = OLD."requestId") <> 'ABERTA' THEN
    RAISE EXCEPTION 'Pedido de material já atendido ou cancelado não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplyrequestline_imutavel
BEFORE UPDATE OR DELETE ON "SupplyRequestLine"
FOR EACH ROW EXECUTE FUNCTION conferir_linha_pedido_material();

-- Chamado concluído ou cancelado não muda mais; nenhum chamado se apaga.
CREATE OR REPLACE FUNCTION bloquear_chamado_encerrado()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Chamados não podem ser excluídos; cancele';
  END IF;
  IF OLD."status" IN ('CONCLUIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Chamado já concluído ou cancelado não pode ser alterado';
  END IF;
  IF NEW."number" IS DISTINCT FROM OLD."number" OR NEW."openedById" IS DISTINCT FROM OLD."openedById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."description" IS DISTINCT FROM OLD."description" THEN
    RAISE EXCEPTION 'O chamado não pode trocar de número, descrição ou de quem abriu';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workorder_imutavel
BEFORE UPDATE OR DELETE ON "WorkOrder"
FOR EACH ROW EXECUTE FUNCTION bloquear_chamado_encerrado();
