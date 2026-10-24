import { expect, test } from "@playwright/test";

import { createUser, deleteUsers, ws, type TestUser } from "./helpers";

let user: TestUser;

test.beforeAll(async () => {
  user = await createUser("recruitment");
});
test.afterAll(async () => deleteUsers([user]));

test.describe("companies", () => {
  test("CRUD, duplicates, search and pagination", async () => {
    const api = user.api;
    const created = await api.post(ws(user, "/companies"), {
      data: { name: "Northwind Cloud Systems", industry: "SaaS", website: "https://northwind.example.com" },
    });
    expect(created.status()).toBe(201);
    const company = await created.json();
    expect(company).toMatchObject({ name: "Northwind Cloud Systems", industry: "SaaS", headquarters: null, workspaceId: user.workspaceId });

    const duplicate = await api.post(ws(user, "/companies"), { data: { name: "  northwind cloud SYSTEMS " } });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).error.code).toBe("conflict");

    const patched = await api.patch(ws(user, `/companies/${company.id}`), { data: { headquarters: "Seattle, WA", website: "" } });
    expect(await patched.json()).toMatchObject({ headquarters: "Seattle, WA", website: null, industry: "SaaS" });

    expect((await api.patch(ws(user, `/companies/${company.id}`), { data: {} })).status()).toBe(400);

    for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      await api.post(ws(user, "/companies"), { data: { name } });
    }
    const search = await (await api.get(ws(user, "/companies?q=north"))).json();
    expect(search.data.map((c: { name: string }) => c.name)).toEqual(["Northwind Cloud Systems"]);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { data: { name: string }[]; nextCursor: string | null } = await (
        await api.get(ws(user, `/companies?limit=2${cursor ? `&cursor=${cursor}` : ""}`))
      ).json();
      seen.push(...page.data.map((c) => c.name));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Northwind Cloud Systems"]);
    expect((await api.get(ws(user, "/companies?cursor=garbage"))).status()).toBe(400);
    expect((await api.get(ws(user, "/companies?limit=500"))).status()).toBe(400);
  });

  test("a company in use cannot be deleted; an unused one can", async () => {
    const api = user.api;
    const used = await (await api.post(ws(user, "/companies"), { data: { name: "In Use Inc" } })).json();
    await api.post(ws(user, "/opportunities"), {
      data: { company: { id: used.id }, title: "Engineer", workMode: "remote", employmentType: "full_time" },
    });
    const blocked = await api.delete(ws(user, `/companies/${used.id}`));
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe("in_use");

    const unused = await (await api.post(ws(user, "/companies"), { data: { name: "Unused LLC" } })).json();
    expect((await api.delete(ws(user, `/companies/${unused.id}`))).status()).toBe(204);
    expect((await api.get(ws(user, `/companies/${unused.id}`))).status()).toBe(404);
    expect((await api.delete(ws(user, `/companies/${unused.id}`))).status()).toBe(404);
  });
});

test.describe("recruiters", () => {
  test("CRUD and filtering by company and text", async () => {
    const api = user.api;
    const company = await (await api.post(ws(user, "/companies"), { data: { name: "Lumen Analytics" } })).json();
    const recruiter = await (
      await api.post(ws(user, "/recruiters"), {
        data: { name: "Marcus Bell", email: "Marcus.Bell@Example.com", agency: "TalentBridge", companyId: company.id },
      })
    ).json();
    expect(recruiter).toMatchObject({ name: "Marcus Bell", email: "marcus.bell@example.com", companyId: company.id });

    const invalid = await api.post(ws(user, "/recruiters"), { data: { name: "X", email: "not-an-email" } });
    expect(invalid.status()).toBe(400);

    const foreignCompany = await api.post(ws(user, "/recruiters"), {
      data: { name: "Y", companyId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(foreignCompany.status()).toBe(400);
    expect((await foreignCompany.json()).error.code).toBe("invalid_reference");

    const byCompany = await (await api.get(ws(user, `/recruiters?companyId=${company.id}`))).json();
    expect(byCompany.data).toHaveLength(1);
    const byAgency = await (await api.get(ws(user, "/recruiters?q=talentbridge"))).json();
    expect(byAgency.data.map((r: { id: string }) => r.id)).toEqual([recruiter.id]);

    const updated = await (await api.patch(ws(user, `/recruiters/${recruiter.id}`), { data: { phone: "(512) 555-0117" } })).json();
    expect(updated).toMatchObject({ phone: "(512) 555-0117", name: "Marcus Bell" });
  });
});

test.describe("opportunities", () => {
  test("create with find-or-create company and inline recruiter", async () => {
    const api = user.api;
    const res = await api.post(ws(user, "/opportunities"), {
      data: {
        company: { name: "Harborline Logistics" },
        recruiter: { create: { name: "Priya Raman", email: "priya@example.com" } },
        title: "Platform Engineer",
        location: "Chicago, IL",
        workMode: "hybrid",
        employmentType: "full_time",
        compensation: { min: 150000, max: 180000, period: "year" },
        requiredSkills: ["Kubernetes", "kubernetes", "AWS"],
      },
    });
    expect(res.status()).toBe(201);
    const opp = await res.json();
    expect(opp).toMatchObject({
      title: "Platform Engineer",
      stage: "new",
      company: { name: "Harborline Logistics" },
      recruiter: { name: "Priya Raman" },
      compensation: { min: 150000, max: 180000, currency: "USD", period: "year" },
      requiredSkills: ["Kubernetes", "AWS"],
    });

    const again = await (
      await api.post(ws(user, "/opportunities"), {
        data: { company: { name: "harborline logistics" }, title: "SRE", workMode: "remote", employmentType: "contract" },
      })
    ).json();
    expect(again.company.id).toBe(opp.company.id);
    expect(again.recruiter).toBeNull();
  });

  test("validation, stage changes, partial updates and filters", async () => {
    const api = user.api;
    const bad = await api.post(ws(user, "/opportunities"), {
      data: { company: { name: "X" }, title: "Y", workMode: "remote", employmentType: "full_time", compensation: { min: 10, max: 5, period: "year" } },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.details[0].path).toBe("compensation.max");

    const opp = await (
      await api.post(ws(user, "/opportunities"), {
        data: { company: { name: "Cobalt Fintech" }, title: "Cloud Infrastructure Engineer", workMode: "hybrid", employmentType: "full_time", jobDescription: "Terraform" },
      })
    ).json();

    const staged = await api.put(ws(user, `/opportunities/${opp.id}/stage`), { data: { stage: "offer" } });
    const stagedBody = await staged.json();
    expect(stagedBody.stage).toBe("offer");
    expect(new Date(stagedBody.stageChangedAt).getTime()).toBeGreaterThanOrEqual(new Date(opp.stageChangedAt).getTime());
    expect((await api.put(ws(user, `/opportunities/${opp.id}/stage`), { data: { stage: "ghosted" } })).status()).toBe(400);

    const patched = await (await api.patch(ws(user, `/opportunities/${opp.id}`), { data: { location: "New York, NY" } })).json();
    expect(patched).toMatchObject({ location: "New York, NY", jobDescription: "Terraform", stage: "offer", title: "Cloud Infrastructure Engineer" });

    const withRecruiter = await (
      await api.patch(ws(user, `/opportunities/${opp.id}`), { data: { recruiter: { create: { name: "Elena Vasquez" } } } })
    ).json();
    expect(withRecruiter.recruiter.name).toBe("Elena Vasquez");
    const unlinked = await (await api.patch(ws(user, `/opportunities/${opp.id}`), { data: { recruiter: null } })).json();
    expect(unlinked.recruiter).toBeNull();

    const byStage = await (await api.get(ws(user, "/opportunities?stage=offer,closed"))).json();
    expect(byStage.data.map((o: { id: string }) => o.id)).toEqual([opp.id]);
    const byCompanyName = await (await api.get(ws(user, "/opportunities?q=cobalt"))).json();
    expect(byCompanyName.data.map((o: { id: string }) => o.id)).toEqual([opp.id]);
    const byTitle = await (await api.get(ws(user, "/opportunities?q=platform&sort=title"))).json();
    expect(byTitle.data.map((o: { title: string }) => o.title)).toEqual(["Platform Engineer"]);
    expect((await api.get(ws(user, "/opportunities?stage=bogus"))).status()).toBe(400);

    expect((await api.delete(ws(user, `/opportunities/${opp.id}`))).status()).toBe(204);
    expect((await api.get(ws(user, `/opportunities/${opp.id}`))).status()).toBe(404);
  });
});
