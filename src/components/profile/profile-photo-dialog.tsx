
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Image from "next/image";

type ProfilePhotoDialogProps = {
  children: React.ReactNode;
  name: string;
  photoURL?: string;
};

export default function ProfilePhotoDialog({
  children,
  name,
  photoURL,
}: ProfilePhotoDialogProps) {

  const handleDownload = () => {
    if (!photoURL) return;
    // Create an anchor element to trigger the download
    const a = document.createElement("a");
    a.href = photoURL;
    a.download = `avatar-${name.toLowerCase().replace(/\s/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent 
        className="max-w-md p-0" 
        onContextMenu={handleContextMenu}
      >
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Foto de Perfil de {name}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full aspect-square">
          {photoURL ? (
             <Image
                src={photoURL}
                alt={`Foto de perfil de ${name}`}
                fill
                className="object-cover"
              />
          ) : (
            <div className="flex items-center justify-center w-full h-full bg-muted">
                <Avatar className="w-1/2 h-1/2">
                    <AvatarFallback className="text-6xl">
                        {name.charAt(0)}
                    </AvatarFallback>
                </Avatar>
            </div>
          )}
        </div>
        <DialogFooter className="p-4 border-t">
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
          <Button onClick={handleDownload} disabled={!photoURL}>
            <Download className="mr-2 h-4 w-4" />
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
