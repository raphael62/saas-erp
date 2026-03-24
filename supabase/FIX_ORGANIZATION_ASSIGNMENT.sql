-- Manual fix: assign orphan organizations to users without org
-- Run in Supabase Dashboard → SQL Editor (run the whole block)

DO $$
DECLARE
  rec RECORD;
  v_org_id uuid;
  v_fixed int := 0;
BEGIN
  FOR rec IN
    SELECT p.id as user_id, p.email
    FROM public.profiles p
    WHERE p.organization_id IS NULL
  LOOP
    v_org_id := NULL;

    SELECT id INTO v_org_id FROM public.organizations
    WHERE created_by = rec.user_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations
      WHERE created_by IS NULL
      ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_org_id IS NOT NULL THEN
      UPDATE public.profiles SET organization_id = v_org_id WHERE id = rec.user_id;
      BEGIN
        UPDATE public.organizations SET created_by = rec.user_id WHERE id = v_org_id AND created_by IS NULL;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'Assigned org to %', rec.email;
    END IF;
  END LOOP;

  IF v_fixed > 0 THEN
    RAISE NOTICE 'Done. Fixed % user(s).', v_fixed;
  ELSE
    RAISE NOTICE 'No unassigned users found, or no organizations available.';
  END IF;
END $$;
