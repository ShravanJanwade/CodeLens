import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvent, InMemoryEventBus } from './index';

test('event bus delivers the typed event and supports unsubscribe', async () => {
  const bus = new InMemoryEventBus();
  const delivered: string[] = [];
  const unsubscribe = bus.subscribe('IncidentCreated', (event) => { delivered.push(event.correlationId); });
  await bus.publish(createEvent('IncidentCreated', 'test', 'INC-1042', { incidentId: 'INC-1042' }));
  unsubscribe();
  await bus.publish(createEvent('IncidentCreated', 'test', 'INC-1043', { incidentId: 'INC-1043' }));
  assert.deepEqual(delivered, ['INC-1042']);
});
