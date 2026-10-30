"use client";

export function FinalizeButton({ finalize }: { finalize: () => Promise<void> }) {
  return (
    <form
      action={finalize}
      onSubmit={(e) => {
        if (!confirm("Depois de finalizado, o atendimento não poderá mais ser alterado, apenas complementado por adendo. Finalizar?")) {
          e.preventDefault();
        }
      }}
    >
      <button className="btn w-full bg-dourado-500 text-marinho-950 hover:bg-dourado-400 sm:w-auto">Finalizar atendimento</button>
    </form>
  );
}
