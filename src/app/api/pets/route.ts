import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ||
    "https://robust-bullfrog-290.convex.cloud"
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const petId = searchParams.get("petId");
  const userId = searchParams.get("userId");

  try {
    if (petId) {
      const pet = await convex.query(api.pets.getById, { petId: petId as any });
      if (!pet) {
        return NextResponse.json({ error: "Pet não encontrado" }, { status: 404 });
      }
      return NextResponse.json({ pet });
    }

    if (userId) {
      try {
        const pets = await convex.query(api.pets.listByUser, { userId: userId as any });
        return NextResponse.json({ pets });
      } catch {
        const pets = await convex.query(api.pets.listAll);
        return NextResponse.json({ pets });
      }
    }

    const pets = await convex.query(api.pets.listAll);
    return NextResponse.json({ pets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      species,
      breed,
      sex,
      birthDate,
      weight,
      photo,
      color,
      microchip,
      notes,
      userId,
      userEmail,
    } = body;

    if (!name || !species) {
      return NextResponse.json(
        { error: "Nome e espécie do animal são obrigatórios." },
        { status: 400 }
      );
    }

    const parsedWeight = weight ? parseFloat(weight) : undefined;

    let finalPhoto = photo;
    if (!finalPhoto) {
      const sp = species.toLowerCase();
      if (sp.includes("gato") || sp.includes("felino")) {
        finalPhoto =
          "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&auto=format&fit=crop&q=80";
      } else if (sp.includes("ave") || sp.includes("pássaro")) {
        finalPhoto =
          "https://images.unsplash.com/photo-1522858547137-f1dcec554f55?w=500&auto=format&fit=crop&q=80";
      } else {
        finalPhoto =
          "https://images.unsplash.com/photo-1552053831-71594a27632d?w=500&auto=format&fit=crop&q=80";
      }
    }

    const pet = await convex.mutation(api.pets.create, {
      name: name.trim(),
      species,
      breed: breed ? breed.trim() : undefined,
      sex: sex || undefined,
      birthDate: birthDate || undefined,
      weight: parsedWeight,
      photo: finalPhoto,
      color: color ? color.trim() : undefined,
      microchip: microchip ? microchip.trim() : undefined,
      notes: notes ? notes.trim() : undefined,
      userEmail: userEmail || "denis@petrec.app",
    });

    return NextResponse.json({
      success: true,
      pet,
      message: `Animal "${pet?.name || name}" cadastrado com sucesso!`,
    });
  } catch (error: any) {
    console.error("Pet creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      petId,
      id,
      name,
      species,
      breed,
      sex,
      birthDate,
      weight,
      photo,
      color,
      microchip,
      notes,
    } = body;

    const targetPetId = petId || id;
    if (!targetPetId) {
      return NextResponse.json(
        { error: "petId é obrigatório para edição." },
        { status: 400 }
      );
    }

    const parsedWeight =
      weight !== undefined && weight !== null && weight !== ""
        ? parseFloat(weight)
        : undefined;

    const updatedPet = await convex.mutation(api.pets.update, {
      petId: targetPetId as any,
      name: name.trim(),
      species,
      breed: breed ? breed.trim() : undefined,
      sex: sex || undefined,
      birthDate: birthDate || undefined,
      weight: parsedWeight,
      photo: photo || undefined,
      color: color ? color.trim() : undefined,
      microchip: microchip ? microchip.trim() : undefined,
      notes: notes ? notes.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      pet: updatedPet,
      message: "Dados do pet atualizados com sucesso!",
    });
  } catch (error: any) {
    console.error("Pet update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    if (!petId) {
      return NextResponse.json(
        { error: "petId é obrigatório para exclusão." },
        { status: 400 }
      );
    }

    await convex.mutation(api.pets.remove, {
      petId: petId as any,
    });

    return NextResponse.json({
      success: true,
      message: "Animal e seus registros foram excluídos com sucesso.",
    });
  } catch (error: any) {
    console.error("Pet delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
