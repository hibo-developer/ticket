import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-zinc-900">Página no encontrada</div>
      <div className="mt-2 text-sm text-zinc-600">La ruta solicitada no existe.</div>
      <div className="mt-4">
        <Link className="text-sm text-zinc-900 underline underline-offset-4" to="/">
          Ir al dashboard
        </Link>
      </div>
    </div>
  )
}

