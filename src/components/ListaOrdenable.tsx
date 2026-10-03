import type { ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';

interface Props<T extends { id: string }> {
  items: T[];
  alReordenar(nuevos: T[]): void;
  alQuitar?(id: string): void;
  render(item: T, indice: number): ReactNode;
}

function Fila<T extends { id: string }>({
  item, indice, total, render, alMover, alQuitar,
}: {
  item: T;
  indice: number;
  total: number;
  render: Props<T>['render'];
  alMover(desde: number, hasta: number): void;
  alQuitar?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      className={'fila-orden' + (isDragging ? ' arrastrando' : '')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="fila-orden"
    >
      <button type="button" className="asa" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
      <span className="fila-num">{indice + 1}</span>
      <div className="fila-contenido">{render(item, indice)}</div>
      <div className="fila-acciones">
        <button type="button" className="btn-icono pequeno" disabled={indice === 0} aria-label="Subir" onClick={() => alMover(indice, indice - 1)}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="btn-icono pequeno" disabled={indice === total - 1} aria-label="Bajar" onClick={() => alMover(indice, indice + 1)}>
          <ArrowDown size={15} />
        </button>
        {alQuitar && (
          <button type="button" className="btn-icono pequeno" aria-label="Quitar" onClick={() => alQuitar(item.id)}>
            <X size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Lista reordenable por arrastre (con botones ↑ ↓ para teclado y ratón). */
export function ListaOrdenable<T extends { id: string }>({ items, alReordenar, alQuitar, render }: Props<T>) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const mover = (desde: number, hasta: number) => alReordenar(arrayMove(items, desde, hasta));
  const alTerminar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const a = items.findIndex((i) => i.id === e.active.id);
    const b = items.findIndex((i) => i.id === e.over!.id);
    if (a >= 0 && b >= 0) mover(a, b);
  };
  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alTerminar}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="lista-orden">
          {items.map((it, i) => (
            <Fila key={it.id} item={it} indice={i} total={items.length} render={render} alMover={mover} alQuitar={alQuitar} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
