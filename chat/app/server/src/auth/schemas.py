from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=256)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    display_name: str
    email: str
    avatar_url: str | None = None
    status: str

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserResponse
    token: str
