import { Button } from '@/components/ui/Button'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('Button', () => {
  it('renderiza el contenido', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByText('Guardar')).toBeInTheDocument()
  })
})

