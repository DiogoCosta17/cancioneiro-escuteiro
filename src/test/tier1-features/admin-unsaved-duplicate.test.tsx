import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SongForm } from '../../components/admin/SongForm';
import type { Song } from '../../lib/types';

const existing: Song[] = [
  {
    id: 's1',
    title: 'Ave Maria',
    artist: null,
    content: '[G]Ave',
    tags: [],
    original_key: 'G',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const renderForm = (props: Partial<React.ComponentProps<typeof SongForm>> = {}) => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <SongForm onSubmit={onSubmit} onCancel={onCancel} existingSongs={existing} {...props} />
    </MemoryRouter>
  );
  return { onCancel, onSubmit };
};

const titleInput = () => screen.getAllByRole('textbox')[1] as HTMLInputElement; // [0] = link de importação

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongForm — alterações não guardadas', () => {
  it('formulário intacto: Cancelar não pede confirmação', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('formulário alterado: pede confirmação e respeita a resposta', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onCancel } = renderForm();
    fireEvent.change(titleInput(), { target: { value: 'Nova música' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('dados pré-preenchidos (edição) não contam como alteração', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { onCancel } = renderForm({
      isEditing: true,
      initialData: { title: 'Ave Maria', artist: '', content: '[G]Ave', tags: ['Entrada'], original_key: 'G' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SongForm — aviso de música duplicada', () => {
  it('mostra o aviso com link para a música existente ao criar', async () => {
    renderForm();
    fireEvent.change(titleInput(), { target: { value: 'Avé-Maria!' } });
    const link = await screen.findByRole('link', { name: /Abrir música existente/ });
    expect(link.getAttribute('href')).toBe('/song/s1');
  });

  it('não mostra o aviso ao editar', () => {
    renderForm({
      isEditing: true,
      initialData: { title: 'Ave Maria', artist: '', content: '[G]Ave', tags: [], original_key: 'G' },
    });
    expect(screen.queryByText(/Abrir música existente/)).toBeNull();
  });
});
