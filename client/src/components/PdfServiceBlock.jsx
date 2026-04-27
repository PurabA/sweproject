/** Visual block grouping a section of a domain page (title + description + body). */
export default function PdfServiceBlock({ title, description, children }) {
  return (
    <section className="hmis-card overflow-hidden border-l-4 border-l-[#1e4a7d]">
      <div className="hmis-card-h flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {/* <h2 className="text-sm font-bold text-slate-900">{title}</h2> */}
          {description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">{description}</p> : null}
        </div>
      </div>
      {children ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </section>
  );
}
