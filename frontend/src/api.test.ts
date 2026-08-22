import { describe, it, expect } from 'vitest';
import { getOficina, simular } from './api';

describe('api (modo mock, sin VITE_API_URL)', () => {
  it('getOficina devuelve 9 personas', async () => {
    const oficina = await getOficina();
    expect(oficina.people).toHaveLength(9);
  });

  it('simular({scenario_id: "renuncia"}) devuelve un playbook_md no vacío', async () => {
    const result = await simular({
      scenario_id: 'renuncia',
      person_id: 'p_ana',
    });
    expect(result.playbook_md.length).toBeGreaterThan(0);
  });
});
