import { NextResponse } from 'next/server';
import { z } from 'zod';
import { INTEGRATION_CATEGORIES } from '@kloyya/core';
import { kasRoute } from '@server/http/handler';
import { ok } from '@server/http/envelope';
import { errors } from '@server/http/errors';
import { assertPermission } from '@server/auth/permission';
import { listConnections } from '@server/integrations/service';

const listQuery = z.object({ category: z.enum(INTEGRATION_CATEGORIES).optional() });

/** The Connection Manager list. Reading which tools a workspace runs on is `workspace:read`. */
export const GET = kasRoute('verified', async (req, ctx) => {
  await assertPermission(ctx.db, ctx.identity.id, 'workspace:read');
  const { category } = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));

  const list = await listConnections(ctx.db, ctx.identity.id, category);
  if (!list) throw errors.notFound('User profile');
  return NextResponse.json(ok(list, ctx.correlationId));
});
